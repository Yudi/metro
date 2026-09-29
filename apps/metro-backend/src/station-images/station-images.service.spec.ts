import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { PrismaService } from '../prisma/prisma.service';
import { StationImagesService } from './station-images.service';

const imageRow = {
  key: 'station-images/metro/luz.avif',
  stationIdentity: 'luz',
  position: 0,
  label: null,
  lineIds: ['1', '4'],
  service: null,
  author: 'Photographer',
  title: 'Luz station platform',
  sourceUrl: 'https://example.com/source',
  license: 'CC BY 4.0',
  licenseUrl: null,
};

describe('StationImagesService', () => {
  it('builds the public manifest from database fields without reading S3', async () => {
    const { service, send, findMany } = createService({}, undefined, [imageRow]);

    const result = await service.getManifest();

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ stationIdentity: 'asc' }, { position: 'asc' }],
    });
    expect(JSON.parse(result.body.toString())).toEqual({
      version: 1,
      stations: {
        luz: [{
          key: imageRow.key,
          lineIds: ['1', '4'],
          author: imageRow.author,
          title: imageRow.title,
          sourceUrl: imageRow.sourceUrl,
          license: imageRow.license,
        }],
      },
    });
    expect(result.etag).toMatch(/^"[a-f0-9]{64}"$/);
    expect((await service.getManifest()).etag).toBe(result.etag);
    expect(send).not.toHaveBeenCalled();
  });

  it('reports an empty metadata table as unavailable', async () => {
    const { service } = createService({}, undefined, []);

    await expect(service.getManifest()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('maps missing image keys to 404 and rejects traversal paths', async () => {
    const missingError = Object.assign(new Error('not found'), {
      $metadata: { httpStatusCode: 404 },
    });
    const { service } = createService({}, missingError);

    await expect(service.getImage('metro', 'missing.avif')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      Promise.resolve().then(() => service.getImage('metro', '../secret.avif')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps storage failures to 502 without exposing upstream details', async () => {
    const { service } = createService(
      {},
      Object.assign(new Error('sensitive upstream response'), {
        $metadata: { httpStatusCode: 503 },
      }),
    );

    await expect(service.getImage('metro', 'luz.avif')).rejects.toMatchObject({
      status: 502,
      message: 'Station image storage is unavailable',
    });
  });
});

function createService(
  result: Record<string, unknown>,
  error?: Error,
  rows: readonly typeof imageRow[] = [imageRow],
): { service: StationImagesService; send: jest.Mock; findMany: jest.Mock } {
  const send = jest.fn().mockImplementation(() =>
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
