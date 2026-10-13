import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  COPYRIGHT_FIXTURE,
  MEDIA_STATION_FIXTURE,
  MEDIA_STOP_FIXTURE,
  MEDIA_TERMINAL_FIXTURE,
} from '@metro/shared/admin-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseService } from '../search/services/typesense.service';
import { BusTerminalService } from '../bus-terminals/bus-terminal.service';
import { StationImagesService } from '../station-images/station-images.service';
import { AdminMediaService } from './admin-media.service';
import { AdminImageConversionService } from './admin-image-conversion.service';
import { parseAdminImageInput } from './admin-media.validation';

type ImageRow = {
  key: string;
  stationIdentity: string;
  position: number;
  label: string | null;
  lineIds: string[];
  stopIds: string[];
  service: string | null;
  author: string;
  title: string;
  sourceUrl: string | null;
  license: string;
  licenseUrl: string | null;
  copyrightId: string | null;
  isDefault: boolean;
};

type LicenseRow = {
  id: string;
  license: string;
  licenseUrl: string | null;
};

const stationCatalog = [
  {
    primaryId: 1,
    name: 'Luz',
    originalName: 'Luz',
    lines: ['Azul', 'Amarela'],
  },
];

describe('AdminMediaService', () => {
  it('uses Typesense, the selected rail catalog, and terminal service scopes', async () => {
    const { service, dependencies } = createHarness();
    dependencies.typesenseSearch.mockResolvedValue([
      {
        type: 'railStation',
        document: {
          id: '1',
          station_code: '1',
          station_name: 'Luz',
          station_aliases: ['LUZ'],
        },
      },
      {
        type: 'busStop',
        document: {
          id: '10001',
          stop_id: '10001',
          stop_name: 'Parada de teste',
          stop_lat: -23.5,
          stop_lon: -46.6,
          is_subway_station: false,
          sourceAgency: 'sptrans',
          sourceId: '10001',
          mergedStopIds: ['10001'],
        },
      },
    ]);

    const stationAndStop = await service.searchResources('Luz');
    expect(dependencies.typesenseSearch).toHaveBeenCalledWith(
      'Luz',
      ['railStation', 'busStop'],
      50,
    );
    expect(stationAndStop).toContainEqual(
      expect.objectContaining({
        identity: MEDIA_STATION_FIXTURE.identity,
        kind: MEDIA_STATION_FIXTURE.kind,
        scopes: expect.arrayContaining([
          expect.objectContaining({ id: '1' }),
          expect.objectContaining({ id: '4' }),
        ]),
      }),
    );
    expect(stationAndStop).toContainEqual(
      expect.objectContaining({
        identity: MEDIA_STOP_FIXTURE.identity,
        kind: MEDIA_STOP_FIXTURE.kind,
      }),
    );

    const terminal = await service.searchResources('Central');
    expect(terminal).toContainEqual(MEDIA_TERMINAL_FIXTURE);
  });

  it('rejects invalid scoped metadata before conversion or storage writes', async () => {
    const { service, dependencies } = createHarness();
    const input = imageInput({
      lineIds: ['1'],
      isDefault: true,
    });

    await expect(service.uploadImage(Buffer.from('not an image'), input)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.uploadImage(validAvif(), imageInput({ lineIds: ['3'] })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      Promise.resolve().then(() => parseAdminImageInput(input)),
    ).rejects.toThrow(BadRequestException);
    const arrayBuffer = jest.fn().mockResolvedValue(new ArrayBuffer(24));
    await expect(
      service.uploadImage(
        { name: 'untrusted.jpg', size: 24, arrayBuffer },
        imageInput({ lineIds: ['3'] }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(dependencies.convertToAvif).not.toHaveBeenCalled();
    expect(dependencies.putImage).not.toHaveBeenCalled();
  });

  it('keeps matching terminals visible when stop results fill the resource limit', async () => {
    const { service, dependencies } = createHarness();
    dependencies.typesenseSearch.mockResolvedValue(
      Array.from({ length: 50 }, (_, index) => ({
        type: 'busStop',
        document: {
          stop_id: String(10001 + index),
          stop_name: `Terminal Central plataforma ${index + 1}`,
          sourceAgency: 'sptrans',
        },
      })),
    );

    const resources = await service.searchResources('Central');

    expect(resources).toHaveLength(50);
    expect(resources).toContainEqual(MEDIA_TERMINAL_FIXTURE);
    expect(resources.filter((resource) => resource.kind === 'stop')).toHaveLength(49);
  });

  it('treats nullable GraphQL metadata fields as omitted optional values', () => {
    const parsed = parseAdminImageInput({
      stationIdentity: MEDIA_STATION_FIXTURE.identity,
      author: 'Fotógrafo de teste',
      title: 'Imagem de teste',
      sourceUrl: 'https://example.test/photos/luz',
      copyrightId: COPYRIGHT_FIXTURE.id,
      label: null,
      lineIds: null,
      stopIds: null,
      service: null,
      isDefault: false,
    });

    expect(parsed).toMatchObject({ lineIds: [], stopIds: [], isDefault: false });
    expect(parsed).not.toHaveProperty('label');
    expect(parsed).not.toHaveProperty('service');
  });

  it('stores images without a source URL and omits it from the public entry', async () => {
    const { service, rows } = createHarness();
    const inputWithoutSourceUrl = Object.fromEntries(
      Object.entries(imageInput()).filter(([field]) => field !== 'sourceUrl'),
    );

    const parsed = parseAdminImageInput(inputWithoutSourceUrl);
    expect(parsed).not.toHaveProperty('sourceUrl');

    const entry = await service.uploadImage(validAvif(), inputWithoutSourceUrl);

    expect(rows.get(entry.key)?.sourceUrl).toBeNull();
    expect(entry).not.toHaveProperty('sourceUrl');
  });

  it('uploads immutable files, replaces the explicit default, and preserves positions on edit', async () => {
    const { service, dependencies, rows } = createHarness();
    const first = await service.uploadImage(validAvif(), imageInput({ isDefault: true }));
    const second = await service.uploadImage(validAvif(), imageInput({
      title: 'Second image',
      isDefault: true,
    }));

    expect(dependencies.putImage).toHaveBeenCalledTimes(2);
    expect(first.key).toMatch(/^station-images\/metro\/[a-f0-9-]+\.avif$/);
    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
    expect([...rows.values()].map((row) => row.isDefault)).toEqual([false, true]);

    const updated = await service.updateImage(second.key, imageInput({
      title: 'Edited title',
      isDefault: false,
    }));
    expect(updated.position).toBe(1);
    expect(updated.title).toBe('Edited title');
    expect(updated.isDefault).toBe(false);
  });

  it('validates terminal stop scopes, uses the terminal category, and compacts positions on delete', async () => {
    const { service, dependencies } = createHarness();
    const invalid = imageInput({
      stationIdentity: MEDIA_TERMINAL_FIXTURE.identity,
      stopIds: ['sptrans:99999'],
      isDefault: false,
    });
    await expect(service.uploadImage(validAvif(), invalid)).rejects.toThrow(
      BadRequestException,
    );
    expect(dependencies.putImage).not.toHaveBeenCalled();

    const terminalInput = imageInput({
      stationIdentity: MEDIA_TERMINAL_FIXTURE.identity,
      stopIds: ['sptrans:10001'],
      isDefault: false,
    });
    const terminalEntry = await service.uploadImage(validAvif(), terminalInput);
    expect(terminalEntry.key).toMatch(/^station-images\/terminal\//);
    const other = await service.uploadImage(validAvif(), imageInput({
      stationIdentity: MEDIA_TERMINAL_FIXTURE.identity,
      stopIds: ['sptrans:10002'],
      isDefault: false,
      title: 'Second terminal image',
    }));

    await service.deleteImage(terminalEntry.key);
    expect(dependencies.removeImageWithRestore).toHaveBeenCalledWith(
      'terminal',
      terminalEntry.key.split('/')[terminalEntry.key.split('/').length - 1],
    );
    const remaining = await service.listImages(MEDIA_TERMINAL_FIXTURE.identity);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ key: other.key, position: 0 });
  });

  it('enforces the per-resource image limit and rejects deletion of a referenced license', async () => {
    const { service, dependencies } = createHarness(
      Array.from({ length: 12 }, (_, position) => imageRow(position)),
    );
    await expect(service.uploadImage(validAvif(), imageInput())).rejects.toThrow(
      ConflictException,
    );
    expect(dependencies.deleteImage).toHaveBeenCalledTimes(1);
    await expect(service.deleteCopyright(COPYRIGHT_FIXTURE.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('uses current shared license terms in admin entries and allows unused license removal', async () => {
    const { service, dependencies } = createHarness([imageRow(0)]);
    await service.updateCopyright(COPYRIGHT_FIXTURE.id, {
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    });
    expect(await service.listImages(MEDIA_STATION_FIXTURE.identity)).toMatchObject([
      {
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      },
    ]);
    await service.deleteImage('station-images/metro/luz-0.avif');
    await service.deleteCopyright(COPYRIGHT_FIXTURE.id);
    expect(dependencies.removeImageWithRestore).toHaveBeenCalled();
  });

  it('restores S3 state when either side of a delete operation fails', async () => {
    const { service, dependencies, rows } = createHarness([imageRow(0)]);
    dependencies.removeImageWithRestore.mockRejectedValueOnce(
      new Error('storage unavailable'),
    );
    await expect(
      service.deleteImage('station-images/metro/luz-0.avif'),
    ).rejects.toThrow('storage unavailable');
    expect(rows.has('station-images/metro/luz-0.avif')).toBe(true);
    expect(dependencies.prisma.stationImage.delete).not.toHaveBeenCalled();

    const restore = jest.fn().mockResolvedValue(undefined);
    dependencies.removeImageWithRestore.mockResolvedValueOnce(restore);
    dependencies.prisma.stationImage.delete.mockRejectedValueOnce(
      new Error('database write failed'),
    );
    await expect(
      service.deleteImage('station-images/metro/luz-0.avif'),
    ).rejects.toThrow('database write failed');
    expect(restore).toHaveBeenCalledTimes(1);
    expect(rows.has('station-images/metro/luz-0.avif')).toBe(true);
  });
});

function imageInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    stationIdentity: MEDIA_STATION_FIXTURE.identity,
    author: 'Fotógrafo de teste',
    title: 'Imagem de teste',
    sourceUrl: 'https://example.test/photos/luz',
    copyrightId: COPYRIGHT_FIXTURE.id,
    lineIds: [],
    stopIds: [],
    isDefault: false,
    ...overrides,
  };
}

function imageRow(position: number): ImageRow {
  return {
    key: `station-images/metro/luz-${position}.avif`,
    stationIdentity: MEDIA_STATION_FIXTURE.identity,
    position,
    label: null,
    lineIds: [],
    stopIds: [],
    service: null,
    author: 'Fotógrafo de teste',
    title: 'Imagem de teste',
    sourceUrl: 'https://example.test/photos/luz',
    license: COPYRIGHT_FIXTURE.license,
    licenseUrl: COPYRIGHT_FIXTURE.licenseUrl ?? null,
    copyrightId: COPYRIGHT_FIXTURE.id,
    isDefault: false,
  };
}

function validAvif(): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(24, 0);
  buffer.write('ftyp', 4, 'ascii');
  buffer.write('avif', 8, 'ascii');
  buffer.writeUInt32BE(0, 12);
  buffer.write('mif1', 16, 'ascii');
  buffer.write('avif', 20, 'ascii');
  return buffer;
}

function createHarness(initialImages: ImageRow[] = []) {
  const rows = new Map(initialImages.map((row) => [row.key, { ...row }]));
  const copyrights = new Map<string, LicenseRow>([
    [
      COPYRIGHT_FIXTURE.id,
      {
        id: COPYRIGHT_FIXTURE.id,
        license: COPYRIGHT_FIXTURE.license,
        licenseUrl: COPYRIGHT_FIXTURE.licenseUrl ?? null,
      },
    ],
  ]);
  const typesenseSearch = jest.fn().mockResolvedValue([]);
  const putImage = jest.fn(async (category: string, filename: string) =>
    `station-images/${category}/${filename}`,
  );
  const convertToAvif = jest.fn(async (input: Buffer) => input);
  const deleteImage = jest.fn().mockResolvedValue(undefined);
  const removeImageWithRestore = jest.fn().mockResolvedValue(jest.fn().mockResolvedValue(undefined));
  const terminalCatalog = [
    {
      id: MEDIA_TERMINAL_FIXTURE.identity,
      name: MEDIA_TERMINAL_FIXTURE.name,
      aliases: ['Central'],
      latitude: -23.5,
      longitude: -46.6,
      stopIds: ['10001', '10002'],
      platformCodes: ['1', '2'],
    },
  ];
  const terminalDetail = {
    ...terminalCatalog[0],
    stops: [
      {
        stopId: '10001',
        name: 'Parada Central 1',
        latitude: -23.5,
        longitude: -46.6,
        sourceAgency: 'sptrans',
        sourceId: '10001',
        platformCode: '1',
        mergedStopIds: ['10001'],
        boardingAllowed: true,
      },
      {
        stopId: '10002',
        name: 'Parada Central 2',
        latitude: -23.5,
        longitude: -46.6,
        sourceAgency: 'sptrans',
        sourceId: '10002',
        platformCode: '2',
        mergedStopIds: ['10002'],
        boardingAllowed: true,
      },
    ],
    routes: [],
  };
  const typesense = { search: typesenseSearch };
  const terminals = {
    getCatalog: jest.fn().mockResolvedValue(terminalCatalog),
    getTerminal: jest.fn().mockResolvedValue(terminalDetail),
  };
  const stationImages = {
    putImage,
    deleteImage,
    removeImageWithRestore,
  };

  const stationImage = {
    findMany: jest.fn(async (args: Record<string, unknown> = {}) => {
      const where = args['where'] as { stationIdentity?: string } | undefined;
      const matching = [...rows.values()].filter((row) =>
        !where?.stationIdentity || row.stationIdentity === where.stationIdentity,
      ).sort((left, right) => left.position - right.position);
      if (args['select']) return matching.map(({ position }) => ({ position }));
      return matching.map((row) =>
        args['include'] ? { ...row, copyright: row.copyrightId ? copyrights.get(row.copyrightId) ?? null : null } : row,
      );
    }),
    findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
      rows.get(where.key),
    ),
    create: jest.fn(async ({ data }: { data: ImageRow }) => {
      const row = { ...data };
      rows.set(row.key, row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: {
      where: { stationIdentity: string; isDefault?: boolean; key?: { not: string } };
      data: Partial<ImageRow>;
    }) => {
      let count = 0;
      for (const row of rows.values()) {
        if (
          row.stationIdentity === where.stationIdentity &&
          (where.isDefault === undefined || row.isDefault === where.isDefault) &&
          (!where.key || row.key !== where.key.not)
        ) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    }),
    update: jest.fn(async ({ where, data }: { where: { key: string }; data: Partial<ImageRow> }) => {
      const row = rows.get(where.key);
      if (!row) throw new Error('missing image');
      Object.assign(row, data);
      return row;
    }),
    delete: jest.fn(async ({ where }: { where: { key: string } }) => {
      const row = rows.get(where.key);
      rows.delete(where.key);
      return row;
    }),
    count: jest.fn(async ({ where }: { where: { copyrightId?: string } }) =>
      [...rows.values()].filter((row) => row.copyrightId === where.copyrightId).length,
    ),
  };
  const imageCopyright = {
    findMany: jest.fn(async () => [...copyrights.values()]),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
      copyrights.get(where.id),
    ),
    findFirst: jest.fn(async ({ where }: { where: { license: string; licenseUrl: string | null; id?: { not: string } } }) =>
      [...copyrights.values()].find((row) =>
        row.license === where.license &&
        row.licenseUrl === where.licenseUrl &&
        (!where.id || row.id !== where.id.not),
      ),
    ),
    create: jest.fn(async ({ data }: { data: Omit<LicenseRow, 'id'> }) => {
      const row = { ...data, id: `copyright-${copyrights.size}` };
      copyrights.set(row.id, row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Omit<LicenseRow, 'id'> }) => {
      const row = { ...data, id: where.id };
      copyrights.set(row.id, row);
      return row;
    }),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const row = copyrights.get(where.id);
      copyrights.delete(where.id);
      return row;
    }),
  };
  const prisma = {
    stationImage,
    imageCopyright,
    mergedRailStation: {
      findMany: jest.fn().mockResolvedValue(stationCatalog),
    },
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join('');
      if (sql.includes('pg_advisory_xact_lock')) {
        throw new Error('Unsupported column type void');
      }
      return sql.includes('Gtfs_Stop')
        ? [{
            stop_id: '10001',
            stop_name: 'Parada de teste',
            source_agency: 'sptrans',
            source_id: '10001',
          }]
        : [];
    }),
    $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join(' ');
      if (sql.includes('position = position +')) {
        const offset = Number(values[0]);
        const identity = String(values[1]);
        const deletedPosition = Number(values[2]);
        for (const row of rows.values()) {
          if (row.stationIdentity === identity && row.position > deletedPosition) {
            row.position += offset;
          }
        }
      } else if (sql.includes('position = position -')) {
        const offset = Number(values[0]);
        const identity = String(values[1]);
        const threshold = Number(values[2]);
        for (const row of rows.values()) {
          if (row.stationIdentity === identity && row.position > threshold) {
            row.position -= offset;
          }
        }
      }
      return 1;
    }),
  };
  const transaction = jest.fn(async <T>(callback: (tx: typeof prisma) => Promise<T>) =>
    callback(prisma),
  );
  Object.assign(prisma, { $transaction: transaction });

  return {
    service: new AdminMediaService(
      prisma as unknown as PrismaService,
      typesense as unknown as TypesenseService,
      terminals as unknown as BusTerminalService,
      stationImages as unknown as StationImagesService,
      { convertToAvif } as unknown as AdminImageConversionService,
    ),
    rows,
    dependencies: {
      typesenseSearch,
      convertToAvif,
      putImage,
      deleteImage,
      removeImageWithRestore,
      terminals,
      prisma,
      copyrights,
    },
  };
}
