import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service';
import { StationImagesService } from './station-images.service';

const imageRow = {
  key: 'station-images/metro/luz.avif',
  stationIdentity: 'luz',
  position: 0,
  label: null,
  lineIds: ['1', '4'],
  stopIds: [],
  service: null,
  author: 'Photographer',
  title: 'Luz station platform',
  sourceUrl: 'https://example.com/source',
  license: 'CC BY 4.0',
  licenseUrl: null,
  copyrightId: null,
  isDefault: false,
  copyright: null,
};

type StationImageTestRow = Omit<
  typeof imageRow,
  'licenseUrl' | 'copyrightId' | 'copyright'
> & {
  licenseUrl: string | null;
  copyrightId: string | null;
  copyright: {
    id: string;
    license: string;
    licenseUrl: string | null;
  } | null;
};

describe('StationImagesService', () => {
  it('builds the public manifest from database fields without reading S3', async () => {
    const { service, send, findMany } = createService({}, undefined, [
      imageRow,
    ]);

    const result = await service.getManifest();

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ stationIdentity: 'asc' }, { position: 'asc' }],
      include: { copyright: true },
    });
    expect(JSON.parse(result.body.toString())).toEqual({
      version: 1,
      stations: {
        luz: [
          {
            key: imageRow.key,
            lineIds: ['1', '4'],
            author: imageRow.author,
            title: imageRow.title,
            sourceUrl: imageRow.sourceUrl,
            license: imageRow.license,
            isDefault: false,
          },
        ],
      },
    });
    expect(result.etag).toMatch(/^"[a-f0-9]{64}"$/);
    expect((await service.getManifest()).etag).toBe(result.etag);
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps terminal IDs in their own manifest namespace', async () => {
    const terminalImageRow = {
      ...imageRow,
      key: 'station-images/terminal/terminalcentral.avif',
      stationIdentity: 'terminal:terminalcentral',
      lineIds: [],
    };
    const { service } = createService({}, undefined, [
      imageRow,
      terminalImageRow,
    ]);

    const manifest = JSON.parse((await service.getManifest()).body.toString());

    expect(manifest.stations).toHaveProperty('luz');
    expect(manifest.stations).not.toHaveProperty('terminal:terminalcentral');
    expect(manifest.terminals).toEqual({
      'terminal:terminalcentral': [
        {
          key: terminalImageRow.key,
          author: terminalImageRow.author,
          title: terminalImageRow.title,
          sourceUrl: terminalImageRow.sourceUrl,
          license: terminalImageRow.license,
          isDefault: false,
        },
      ],
    });
  });

  it('keeps namespaced stop identities and uses the referenced license', async () => {
    const stopImageRow = {
      ...imageRow,
      key: 'station-images/stop/stop-fixture.avif',
      stationIdentity: 'stop:sptrans:10001',
      lineIds: [],
      stopIds: [],
      copyrightId: 'license-id',
      license: 'Legacy CC BY',
      licenseUrl: 'https://example.com/legacy-license',
      copyright: {
        id: 'license-id',
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      },
    };
    const { service } = createService({}, undefined, [stopImageRow]);

    const manifest = JSON.parse((await service.getManifest()).body.toString());

    expect(manifest.stops['stop:sptrans:10001'][0]).toMatchObject({
      key: stopImageRow.key,
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      isDefault: false,
    });
    expect(manifest.stations).toEqual({});
  });

  it('reports an empty metadata table as unavailable', async () => {
    const { service } = createService({}, undefined, []);

    await expect(service.getManifest()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('passes downstream cancellation to the storage request', async () => {
    const body = Readable.from(['image']);
    const { service, send } = createService({ Body: body });
    const cancellation = new AbortController();

    const image = await service.getImage('metro', 'luz.avif', cancellation.signal);

    expect(image.body).toBe(body);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { Bucket: 'metro', Key: 'station-images/metro/luz.avif' },
      }),
      { abortSignal: cancellation.signal },
    );
    await service.getImage('terminal', 'terminalcentral.avif');
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: {
          Bucket: 'metro',
          Key: 'station-images/terminal/terminalcentral.avif',
        },
      }),
      { abortSignal: undefined },
    );
    body.destroy();
  });

  it('maps missing image keys to 404 and rejects traversal paths', async () => {
    const missingError = Object.assign(new Error('not found'), {
      $metadata: { httpStatusCode: 404 },
    });
    const { service } = createService({}, missingError);

    await expect(
      service.getImage('metro', 'missing.avif'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      Promise.resolve().then(() => service.getImage('metro', '../secret.avif')),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      Promise.resolve().then(() =>
        service.getImage('terminal', '../secret.avif'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps storage failures to 502 without exposing upstream details', async () => {
    const { service } = createService(
      {},
      Object.assign(new Error('sensitive upstream response'), {
        $metadata: { httpStatusCode: 503 },
      }),
    );

    await expect(
      service.getImage('terminal', 'terminalcentral.avif'),
    ).rejects.toMatchObject({
      status: 502,
      message: 'Station image storage is unavailable',
    });
  });

  it('restores an image when storage deletes it but loses the delete response', async () => {
    const bytes = Buffer.from('image bytes');
    let storedImage: Buffer | null = bytes;
    const { service, send } = createService({});
    send.mockImplementation(async (command: unknown) => {
      if (command instanceof HeadObjectCommand) {
        return { ContentLength: bytes.byteLength };
      }
      if (command instanceof GetObjectCommand) {
        return {
          Body: Readable.from([bytes]),
          ContentType: 'image/avif',
          CacheControl: 'public, max-age=86400',
          Metadata: { attribution: 'fixture' },
        };
      }
      if (command instanceof DeleteObjectCommand) {
        storedImage = null;
        throw new Error('Delete response connection reset');
      }
      if (command instanceof PutObjectCommand && Buffer.isBuffer(command.input.Body)) {
        storedImage = command.input.Body;
        return {};
      }
      throw new Error('Unexpected storage command');
    });

    await expect(service.removeImageWithRestore('metro', 'luz.avif')).rejects.toMatchObject({
      status: 502,
      message: 'Station image storage is unavailable',
    });
    expect(storedImage).toEqual(bytes);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({
      input: {
        Bucket: 'metro',
        Key: imageRow.key,
        Body: bytes,
        ContentLength: bytes.byteLength,
        ContentType: 'image/avif',
        CacheControl: 'public, max-age=86400',
        Metadata: { attribution: 'fixture' },
      },
    }));
  });

  it('reports failed recovery separately when the delete outcome is unknown', async () => {
    const { service, send } = createService({});
    send
      .mockResolvedValueOnce({ ContentLength: 5 })
      .mockResolvedValueOnce({ Body: Readable.from(['image']) })
      .mockRejectedValueOnce(new Error('Delete response connection reset'))
      .mockRejectedValueOnce(new Error('Recovery unavailable'));

    await expect(service.removeImageWithRestore('metro', 'luz.avif')).rejects.toMatchObject({
      status: 503,
      message: 'Station image recovery could not be confirmed',
    });
    expect(send).toHaveBeenLastCalledWith(expect.any(PutObjectCommand));
  });

  it('returns a recovery callback after a confirmed storage deletion', async () => {
    const { service, send } = createService({});
    send
      .mockResolvedValueOnce({ ContentLength: 5 })
      .mockResolvedValueOnce({ Body: Readable.from(['image']) })
      .mockResolvedValueOnce({});

    const restore = await service.removeImageWithRestore('metro', 'luz.avif');

    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith(expect.any(DeleteObjectCommand));
    await restore();
    expect(send).toHaveBeenLastCalledWith(expect.any(PutObjectCommand));
  });
});

function createService(
  result: Record<string, unknown>,
  error?: Error,
  rows: readonly StationImageTestRow[] = [imageRow],
): { service: StationImagesService; send: jest.Mock; findMany: jest.Mock } {
  const send = jest
    .fn()
    .mockImplementation(() =>
      error ? Promise.reject(error) : Promise.resolve(result),
    );
  const findMany = jest.fn().mockResolvedValue(rows);
  const s3Client = { send, destroy: jest.fn() } as unknown as S3Client;
  const prisma = { stationImage: { findMany } } as unknown as PrismaService;
  const service = new StationImagesService(
    s3Client,
    new ConfigService({ S3_BUCKET: 'metro' }),
    prisma,
  );
  return { service, send, findMany };
}
