import { Test } from '@nestjs/testing';
import {
  GraphQLModule,
} from '@nestjs/graphql';
import { YogaDriver, type YogaDriverConfig } from '@graphql-yoga/nestjs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:net';
import sharp from 'sharp';
import {
  COPYRIGHT_FIXTURE,
  IMAGE_ENTRY_FIXTURE,
  IMAGE_PNG_FIXTURE_BASE64,
  MEDIA_STATION_FIXTURE,
  MEDIA_TERMINAL_FIXTURE,
} from '@metro/shared/admin-contracts';
import { AdminAccessService } from '../admin-auth/admin-access.service';
import { AdminGuard } from '../admin-auth/admin.guard';
import { BusTerminalService } from '../bus-terminals/bus-terminal.service';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseService } from '../search/services/typesense.service';
import { StationImagesService } from '../station-images/station-images.service';
import { createGraphQLYogaConfig } from '../common/graphql/graphql-yoga.config';
import { LoadersService } from '../common/graphql/loaders.service';
import { AdminImageConversionService } from './admin-image-conversion.service';
import { AdminMediaResolver } from './admin-media.resolver';
import {
  AdminImageFileScalar,
} from './admin-media.graphql.types';
import { AdminMediaService } from './admin-media.service';
import { assertAvifImage } from './admin-media.validation';

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
  sourceUrl: string;
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

type GraphQLPayload = {
  data?: Record<string, unknown> | null;
  errors?: Array<{
    message: string;
    extensions?: Record<string, unknown>;
  }>;
};

const IMAGE_FIELDS = `
  key stationIdentity position copyrightId label lineIds stopIds service isDefault
  author title sourceUrl license licenseUrl
`;

describe('Admin media GraphQL HTTP lifecycle', () => {
  let app: NestExpressApplication;
  let endpoint: string;
  let prisma: ReturnType<typeof createPrismaMock>;
  let storedObjects: Map<string, Buffer>;
  let putImage: jest.Mock;
  let removeImageWithRestore: jest.Mock;
  let conversion: AdminImageConversionService;
  let convertToAvif: jest.SpyInstance;

  beforeAll(async () => {
    prisma = createPrismaMock();
    const typesense = {
      search: jest.fn().mockResolvedValue([
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
      ]),
    };
    const terminals = {
      getCatalog: jest.fn().mockResolvedValue([
        {
          id: MEDIA_TERMINAL_FIXTURE.identity,
          name: MEDIA_TERMINAL_FIXTURE.name,
          aliases: ['Terminal Central', 'Central'],
          latitude: -23.5,
          longitude: -46.6,
          stopIds: ['10001', '10002'],
          platformCodes: ['1', '2'],
        },
      ]),
      getTerminal: jest.fn().mockResolvedValue({
        id: MEDIA_TERMINAL_FIXTURE.identity,
        name: MEDIA_TERMINAL_FIXTURE.name,
        aliases: ['Terminal Central', 'Central'],
        latitude: -23.5,
        longitude: -46.6,
        stopIds: ['10001', '10002'],
        platformCodes: ['1', '2'],
        stops: [
          {
            stopId: '10001',
            name: 'Plataforma Central 1',
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
            name: 'Plataforma Central 2',
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
      }),
    };
    storedObjects = new Map<string, Buffer>();
    putImage = jest.fn(async (category: string, filename: string, image: Buffer) => {
      const key = `station-images/${category}/${filename}`;
      storedObjects.set(key, Buffer.from(image));
      return key;
    });
    removeImageWithRestore = jest.fn(async (category: string, filename: string) => {
      const key = `station-images/${category}/${filename}`;
      const saved = storedObjects.get(key);
      storedObjects.delete(key);
      return async () => {
        if (saved) storedObjects.set(key, saved);
      };
    });
    const stationImages = {
      putImage,
      deleteImage: jest.fn(async (category: string, filename: string) => {
        storedObjects.delete(`station-images/${category}/${filename}`);
      }),
      removeImageWithRestore,
    };
    const adminAccess = {
      configuredBootstrapUid: null,
      verifyIdToken: jest.fn(async (token: string) => ({
        uid: token === 'regular' ? 'editor-fixture' : 'admin-fixture',
        admin: token !== 'regular',
      })),
      getUser: jest.fn(async (uid: string) => ({
        uid,
        disabled: false,
        customClaims: { admin: uid === 'admin-fixture' },
      })),
      synchronizeBootstrapAdmin: jest.fn(),
    };
    const loaders = {
      createLoaders: () => ({}),
    } as unknown as LoadersService;
    const moduleRef = await Test.createTestingModule({
      imports: [
        GraphQLModule.forRoot<YogaDriverConfig>({
          driver: YogaDriver,
          ...createGraphQLYogaConfig(loaders, true),
          autoSchemaFile: true,
          graphiql: false,
        }),
      ],
      providers: [
        AdminMediaResolver,
        AdminImageFileScalar,
        AdminGuard,
        AdminMediaService,
        AdminImageConversionService,
        { provide: AdminAccessService, useValue: adminAccess },
        { provide: PrismaService, useValue: prisma },
        { provide: TypesenseService, useValue: typesense },
        { provide: BusTerminalService, useValue: terminals },
        { provide: StationImagesService, useValue: stationImages },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as Server).address();
    if (!address || typeof address === 'string') {
      throw new Error('Admin media GraphQL integration server did not bind an ephemeral port');
    }
    endpoint = `http://127.0.0.1:${address.port}/api/graphql`;
    conversion = app.get(AdminImageConversionService);
    convertToAvif = jest.spyOn(conversion, 'convertToAvif');
  });

  afterAll(async () => {
    convertToAvif?.mockRestore();
    await app.close();
  });

  beforeEach(() => {
    prisma.images.clear();
    prisma.copyrights.set(COPYRIGHT_FIXTURE.id, {
      id: COPYRIGHT_FIXTURE.id,
      license: COPYRIGHT_FIXTURE.license,
      licenseUrl: COPYRIGHT_FIXTURE.licenseUrl ?? null,
    });
    putImage.mockClear();
    removeImageWithRestore.mockClear();
    convertToAvif.mockClear();
  });

  it('guards GraphQL operations, searches scopes, converts real PNG bytes, updates attribution, and deletes records', async () => {
    const unauthenticated = await executeJson(
      'query { adminMediaResources(query: "Luz") { identity } }',
    );
    expect(unauthenticated.response.headers.get('cache-control')).toBe('no-store');
    expect(unauthenticated.payload.errors?.[0]?.extensions?.['code']).toBe(
      'UNAUTHENTICATED',
    );

    const forbidden = await executeJson(
      'query { adminMediaResources(query: "Luz") { identity } }',
      'regular',
    );
    expect(forbidden.payload.errors?.[0]?.extensions?.['code']).toBe('FORBIDDEN');

    const resources = await executeJson(
      'query { adminMediaResources(query: "Luz") { kind identity name scopes { id label } } }',
      'admin',
    );
    const resourceRows = resources.payload.data?.['adminMediaResources'] as Array<{
      identity: string;
      scopes: Array<{ id: string; label: string }>;
    }>;
    expect(resourceRows).toContainEqual(expect.objectContaining({
      identity: MEDIA_STATION_FIXTURE.identity,
      scopes: expect.arrayContaining([
        expect.objectContaining({ id: '1' }),
        expect.objectContaining({ id: '4' }),
      ]),
    }));
    const terminalResources = await executeJson(
      'query { adminMediaResources(query: "Central") { identity scopes { id label } } }',
      'admin',
    );
    expect(terminalResources.payload.data?.['adminMediaResources']).toContainEqual(
      expect.objectContaining({
        identity: MEDIA_TERMINAL_FIXTURE.identity,
        scopes: expect.arrayContaining([
          { id: 'sptrans:10001', label: 'Plataforma 1' },
          { id: 'sptrans:10002', label: 'Plataforma 2' },
        ]),
      }),
    );

    const licenseResult = await executeJson(`
      mutation CreateLicense($input: AdminImageLicenseInput!) {
        createAdminImageLicense(input: $input) { id license licenseUrl }
      }
    `, 'admin', {
      input: {
        license: COPYRIGHT_FIXTURE.license,
        licenseUrl: COPYRIGHT_FIXTURE.licenseUrl,
      },
    });
    expect(licenseResult.payload.errors).toBeUndefined();
    const license = licenseResult.payload.data?.['createAdminImageLicense'] as LicenseRow;
    expect(license.id).toBe(COPYRIGHT_FIXTURE.id);
    const licenses = await executeJson(
      'query { adminImageLicenses { id license licenseUrl } }',
      'admin',
    );
    expect(licenses.payload.data?.['adminImageLicenses']).toContainEqual(
      expect.objectContaining({
        id: COPYRIGHT_FIXTURE.id,
        license: COPYRIGHT_FIXTURE.license,
      }),
    );

    const firstResult = await uploadPng({
      stationIdentity: MEDIA_STATION_FIXTURE.identity,
      author: IMAGE_ENTRY_FIXTURE.author,
      title: IMAGE_ENTRY_FIXTURE.title,
      label: IMAGE_ENTRY_FIXTURE.label,
      sourceUrl: IMAGE_ENTRY_FIXTURE.sourceUrl,
      copyrightId: license.id,
      lineIds: [],
      stopIds: [],
      isDefault: true,
    });
    expect(firstResult.payload.errors).toBeUndefined();
    const first = firstResult.payload.data?.['uploadAdminImage'] as ImageRow;
    expect(first).toMatchObject({
      key: expect.stringMatching(/^station-images\/metro\/[a-f0-9-]+\.avif$/),
      position: 0,
      stationIdentity: MEDIA_STATION_FIXTURE.identity,
      author: IMAGE_ENTRY_FIXTURE.author,
      title: IMAGE_ENTRY_FIXTURE.title,
      license: COPYRIGHT_FIXTURE.license,
      isDefault: true,
    });
    const storedAvif = storedObjects.get(first.key);
    expect(storedAvif).toBeDefined();
    assertAvifImage(storedAvif as Buffer);
    const storedMetadata = await sharp(storedAvif as Buffer).metadata();
    expect(
      String(storedMetadata.format) === 'avif' ||
        (storedMetadata.format === 'heif' && storedMetadata.compression === 'av1'),
    ).toBe(true);
    expect(storedMetadata).toMatchObject({ width: 64, height: 32 });
    expect(convertToAvif).toHaveBeenCalledTimes(1);

    const secondResult = await uploadPng({
      stationIdentity: MEDIA_STATION_FIXTURE.identity,
      author: 'Outra autora',
      title: 'Luz interna',
      sourceUrl: 'https://example.test/photos/luz-interna',
      copyrightId: license.id,
      lineIds: [],
      stopIds: [],
      isDefault: true,
    });
    const second = secondResult.payload.data?.['uploadAdminImage'] as ImageRow;
    expect(second.position).toBe(1);
    expect([...prisma.images.values()].map((row) => row.isDefault)).toEqual([
      false,
      true,
    ]);

    const invalidScope = await uploadPng({
      stationIdentity: MEDIA_TERMINAL_FIXTURE.identity,
      author: 'Autora',
      title: 'Parada inválida',
      sourceUrl: 'https://example.test/photos/invalid',
      copyrightId: license.id,
      lineIds: [],
      stopIds: ['sptrans:99999'],
      isDefault: false,
    });
    expect(invalidScope.payload.errors?.[0]?.extensions?.['code']).toBe('BAD_REQUEST');
    expect(convertToAvif).toHaveBeenCalledTimes(2);

    const updateResult = await executeJson(`
      mutation UpdateImage($key: String!, $metadata: AdminImageInput!) {
        updateAdminImage(key: $key, metadata: $metadata) { ${IMAGE_FIELDS} }
      }
    `, 'admin', {
      key: second.key,
      metadata: {
        stationIdentity: MEDIA_STATION_FIXTURE.identity,
        author: 'Autora revisada',
        title: 'Luz interna revisada',
        sourceUrl: 'https://example.test/photos/luz-interna',
        copyrightId: license.id,
        lineIds: [],
        stopIds: [],
        isDefault: true,
      },
    });
    expect(updateResult.payload.data?.['updateAdminImage']).toMatchObject({
      position: 1,
      author: 'Autora revisada',
      title: 'Luz interna revisada',
      isDefault: true,
    });

    const updateLicense = await executeJson(`
      mutation UpdateLicense($id: String!, $input: AdminImageLicenseInput!) {
        updateAdminImageLicense(id: $id, input: $input) { id license licenseUrl }
      }
    `, 'admin', {
      id: license.id,
      input: {
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      },
    });
    expect(updateLicense.payload.errors).toBeUndefined();
    const listResult = await executeJson(`
      query Images($identity: String!) {
        adminImages(identity: $identity) { ${IMAGE_FIELDS} }
      }
    `, 'admin', { identity: MEDIA_STATION_FIXTURE.identity });
    expect(listResult.payload.data?.['adminImages']).toMatchObject([
      { position: 0, isDefault: false },
      {
        position: 1,
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      },
    ]);

    const referencedLicenseDelete = await executeJson(`
      mutation DeleteLicense($id: String!) { deleteAdminImageLicense(id: $id) }
    `, 'admin', { id: license.id });
    expect(referencedLicenseDelete.payload.errors?.[0]?.extensions?.['code']).toBe('CONFLICT');

    const deleteFirst = await executeJson(`
      mutation DeleteImage($key: String!) { deleteAdminImage(key: $key) }
    `, 'admin', { key: first.key });
    expect(deleteFirst.payload.data?.['deleteAdminImage']).toBe(true);
    expect(removeImageWithRestore).toHaveBeenCalledWith(
      'metro',
      first.key.split('/')[first.key.split('/').length - 1],
    );
    const survivingMetadata = await sharp(storedObjects.get(second.key) as Buffer).metadata();
    expect(
      String(survivingMetadata.format) === 'avif' ||
        (survivingMetadata.format === 'heif' && survivingMetadata.compression === 'av1'),
    ).toBe(true);

    const deleteSecond = await executeJson(`
      mutation DeleteImage($key: String!) { deleteAdminImage(key: $key) }
    `, 'admin', { key: second.key });
    expect(deleteSecond.payload.data?.['deleteAdminImage']).toBe(true);
    const deleteLicense = await executeJson(`
      mutation DeleteLicense($id: String!) { deleteAdminImageLicense(id: $id) }
    `, 'admin', { id: license.id });
    expect(deleteLicense.payload.data?.['deleteAdminImageLicense']).toBe(true);
  });

  it('does not read uploads before authorization and rejects SVG without storing it', async () => {
    const metadata = {
      stationIdentity: MEDIA_STATION_FIXTURE.identity,
      author: 'Autora',
      title: 'Imagem',
      sourceUrl: 'https://example.test/photo',
      copyrightId: COPYRIGHT_FIXTURE.id,
      lineIds: [],
      stopIds: [],
      isDefault: false,
    };
    const denied = await uploadFile(
      new Blob([pngArrayBuffer()], { type: 'image/png' }),
      metadata,
      'regular',
    );
    expect(denied.payload.errors?.[0]?.extensions?.['code']).toBe('FORBIDDEN');
    expect(convertToAvif).not.toHaveBeenCalled();

    const unsupported = await uploadFile(
      new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'], { type: 'image/svg+xml' }),
      metadata,
      'admin',
      'vector.svg',
    );
    expect(unsupported.payload.errors?.[0]?.extensions?.['code']).toBe(
      'UNSUPPORTED_MEDIA_TYPE',
    );
    expect(putImage).not.toHaveBeenCalled();
  });

  async function executeJson(
    query: string,
    token?: string,
    variables?: Record<string, unknown>,
  ): Promise<{ response: Response; payload: GraphQLPayload }> {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (token) headers.set('authorization', `Bearer ${token}`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });
    return { response, payload: await response.json() as GraphQLPayload };
  }

  async function uploadPng(metadata: Record<string, unknown>) {
    return uploadFile(
      new Blob([pngArrayBuffer()], { type: 'image/jpeg' }),
      metadata,
      'admin',
      'not-a-png.jpg',
    );
  }

  async function uploadFile(
    file: Blob,
    metadata: Record<string, unknown>,
    token: string,
    filename = 'photo.png',
  ): Promise<{ response: Response; payload: GraphQLPayload }> {
    const form = new FormData();
    form.set('operations', JSON.stringify({
      query: `mutation Upload($file: File!, $metadata: AdminImageInput!) {
        uploadAdminImage(file: $file, metadata: $metadata) { ${IMAGE_FIELDS} }
      }`,
      variables: { file: null, metadata },
    }));
    form.set('map', JSON.stringify({ '0': ['variables.file'] }));
    form.set('0', file, filename);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'X-GraphQL-Upload': '1',
      },
      body: form,
    });
    return { response, payload: await response.json() as GraphQLPayload };
  }
});

function createPrismaMock() {
  const images = new Map<string, ImageRow>();
  const copyrights = new Map<string, LicenseRow>([
    [COPYRIGHT_FIXTURE.id, {
      id: COPYRIGHT_FIXTURE.id,
      license: COPYRIGHT_FIXTURE.license,
      licenseUrl: COPYRIGHT_FIXTURE.licenseUrl ?? null,
    }],
  ]);
  const stationImage = {
    findMany: jest.fn(async (args: Record<string, unknown> = {}) => {
      const where = args['where'] as { stationIdentity?: string } | undefined;
      const found = [...images.values()]
        .filter((row) => !where?.stationIdentity || row.stationIdentity === where.stationIdentity)
        .sort((left, right) => left.position - right.position);
      if (args['select']) return found.map(({ position }) => ({ position }));
      return found.map((row) => args['include']
        ? { ...row, copyright: row.copyrightId ? copyrights.get(row.copyrightId) ?? null : null }
        : row,
      );
    }),
    findUnique: jest.fn(async ({ where }: { where: { key: string } }) => images.get(where.key)),
    create: jest.fn(async ({ data }: { data: ImageRow }) => {
      const row = { ...data };
      images.set(row.key, row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: {
      where: { stationIdentity: string; isDefault?: boolean; key?: { not: string } };
      data: Partial<ImageRow>;
    }) => {
      let count = 0;
      for (const row of images.values()) {
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
      const row = images.get(where.key);
      if (!row) throw new Error('Image not found');
      Object.assign(row, data);
      return row;
    }),
    delete: jest.fn(async ({ where }: { where: { key: string } }) => {
      const row = images.get(where.key);
      images.delete(where.key);
      return row;
    }),
    count: jest.fn(async ({ where }: { where: { copyrightId: string } }) =>
      [...images.values()].filter((row) => row.copyrightId === where.copyrightId).length,
    ),
  };
  const imageCopyright = {
    findMany: jest.fn(async () => [...copyrights.values()]),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => copyrights.get(where.id)),
    findFirst: jest.fn(async ({ where }: {
      where: { id?: { not: string }; license: string; licenseUrl: string | null };
    }) => [...copyrights.values()].find((row) =>
      row.license === where.license &&
      row.licenseUrl === where.licenseUrl &&
      (!where.id || row.id !== where.id.not),
    )),
    create: jest.fn(async ({ data }: { data: Omit<LicenseRow, 'id'> }) => {
      const row = { ...data, id: `copyright-${copyrights.size}` };
      copyrights.set(row.id, row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: {
      where: { id: string };
      data: Omit<LicenseRow, 'id'>;
    }) => {
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
    images,
    copyrights,
    stationImage,
    imageCopyright,
    mergedRailStation: {
      findMany: jest.fn().mockResolvedValue([{
        primaryId: 1,
        name: 'Luz',
        originalName: 'Luz',
        lines: ['Azul', 'Amarela'],
      }]),
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
        for (const row of images.values()) {
          if (row.stationIdentity === identity && row.position > deletedPosition) {
            row.position += offset;
          }
        }
      } else if (sql.includes('position = position -')) {
        const offset = Number(values[0]);
        const identity = String(values[1]);
        const threshold = Number(values[2]);
        for (const row of images.values()) {
          if (row.stationIdentity === identity && row.position > threshold) {
            row.position -= offset;
          }
        }
      }
      return 1;
    }),
  };
  Object.assign(prisma, {
    $transaction: jest.fn(async <T>(callback: (tx: typeof prisma) => Promise<T>) =>
      callback(prisma),
    ),
  });
  return prisma;
}

function pngArrayBuffer(): ArrayBuffer {
  const bytes = Buffer.from(IMAGE_PNG_FIXTURE_BASE64, 'base64');
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return arrayBuffer;
}
