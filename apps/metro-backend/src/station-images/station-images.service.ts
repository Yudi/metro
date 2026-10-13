import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type {
  GetObjectCommandOutput,
  HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type {
  StationImage,
  StationImageManifest,
} from '@metro/shared/station-image-contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildStationImageObjectKey,
  parseStationImageManifest,
} from './station-images.contract';

export const STATION_IMAGES_S3_CLIENT = Symbol('STATION_IMAGES_S3_CLIENT');
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_RESTORABLE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_STATION_IMAGE_BYTES = MAX_RESTORABLE_IMAGE_BYTES;

export interface StationImageObject {
  body: Readable;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
}

@Injectable()
export class StationImagesService implements OnModuleDestroy {
  private readonly logger = new Logger(StationImagesService.name);

  constructor(
    @Inject(STATION_IMAGES_S3_CLIENT)
    private readonly s3Client: S3Client | null,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getManifest(): Promise<{ body: Buffer; etag: string }> {
    const rows = await this.prisma.stationImage.findMany({
      orderBy: [{ stationIdentity: 'asc' }, { position: 'asc' }],
      include: { copyright: true },
    });
    if (rows.length === 0) {
      throw new ServiceUnavailableException(
        'Station image metadata is not configured',
      );
    }

    const stations = new Map<string, StationImage[]>();
    const stops = new Map<string, StationImage[]>();
    const terminals = new Map<string, StationImage[]>();
    for (const row of rows) {
      const imageGroups = row.stationIdentity.startsWith('terminal:')
        ? terminals
        : row.stationIdentity.startsWith('stop:')
          ? stops
          : stations;
      const images = imageGroups.get(row.stationIdentity) ?? [];
      images.push({
        key: row.key,
        label: row.label ?? undefined,
        lineIds: row.lineIds.length > 0 ? row.lineIds : undefined,
        stopIds: row.stopIds.length > 0 ? row.stopIds : undefined,
        service: row.service === 'train' ? 'train' : undefined,
        isDefault: row.isDefault ?? false,
        author: row.author,
        title: row.title,
        ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
        license: row.copyright?.license ?? row.license,
        licenseUrl: row.copyright
          ? row.copyright.licenseUrl ?? undefined
          : row.licenseUrl ?? undefined,
      });
      imageGroups.set(row.stationIdentity, images);
    }

    const manifest: StationImageManifest = {
      version: 1,
      stations: Object.fromEntries(stations),
      ...(stops.size > 0 ? { stops: Object.fromEntries(stops) } : {}),
      ...(terminals.size > 0 ? { terminals: Object.fromEntries(terminals) } : {}),
    };
    const body = Buffer.from(JSON.stringify(manifest));
    if (body.byteLength > MAX_MANIFEST_BYTES) {
      throw new BadGatewayException(
        'Station image metadata exceeds the allowed size',
      );
    }
    try {
      parseStationImageManifest(body.toString('utf8'));
    } catch {
      throw new BadGatewayException('Station image metadata is invalid');
    }
    return {
      body,
      etag: `"${createHash('sha256').update(body).digest('hex')}"`,
    };
  }

  getImageObjectKey(category: string, filename: string): string {
    try {
      return buildStationImageObjectKey(category, filename);
    } catch {
      throw new NotFoundException('Station image not found');
    }
  }

  async putImage(
    category: string,
    filename: string,
    body: Buffer,
  ): Promise<string> {
    const key = this.getImageObjectKey(category, filename);
    const { client, bucket } = this.requireStorage();
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentLength: body.byteLength,
          ContentType: 'image/avif',
          CacheControl: 'public, max-age=86400, stale-while-revalidate=604800',
        }),
      );
      return key;
    } catch (error) {
      this.logger.warn(`Station image upload failed for ${key}`);
      throw new BadGatewayException('Station image storage is unavailable', {
        cause: error,
      });
    }
  }

  async deleteImage(category: string, filename: string): Promise<void> {
    const key = this.getImageObjectKey(category, filename);
    const { client, bucket } = this.requireStorage();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      this.logger.warn(`Station image deletion failed for ${key}`);
      throw new BadGatewayException('Station image storage is unavailable', {
        cause: error,
      });
    }
  }

  async removeImageWithRestore(
    category: string,
    filename: string,
  ): Promise<() => Promise<void>> {
    const key = this.getImageObjectKey(category, filename);
    const { client, bucket } = this.requireStorage();
    let head: HeadObjectCommandOutput;
    try {
      head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      if (getStatusCode(error) === 404 || getErrorName(error) === 'NotFound') {
        return async () => undefined;
      }
      this.logger.warn(`Station image inspection failed for ${key}`);
      throw new BadGatewayException('Station image storage is unavailable', {
        cause: error,
      });
    }

    if (
      head.ContentLength === undefined ||
      head.ContentLength > MAX_RESTORABLE_IMAGE_BYTES
    ) {
      throw new ServiceUnavailableException(
        'Station image exceeds the safe storage cleanup limit',
      );
    }

    let object: GetObjectCommandOutput;
    try {
      object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      this.logger.warn(`Station image backup failed for ${key}`);
      throw new BadGatewayException('Station image storage is unavailable', {
        cause: error,
      });
    }
    const body = toNodeReadable(object.Body);
    if (!body) {
      throw new BadGatewayException('Station image storage is unavailable');
    }
    const bytes = await readLimitedBody(body, MAX_RESTORABLE_IMAGE_BYTES);
    const restoreInput = {
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentLength: bytes.byteLength,
      ...(object.ContentType ? { ContentType: object.ContentType } : {}),
      ...(object.CacheControl ? { CacheControl: object.CacheControl } : {}),
      ...(object.Metadata ? { Metadata: object.Metadata } : {}),
    };
    const restore = async (): Promise<void> => {
      try {
        await client.send(new PutObjectCommand(restoreInput));
      } catch (error) {
        this.logger.error(`Station image recovery failed for ${key}`);
        throw new ServiceUnavailableException(
          'Station image recovery could not be confirmed',
          { cause: error },
        );
      }
    };

    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      this.logger.warn(`Station image deletion failed for ${key}`);
      // A lost response can reject a delete that storage already applied.
      await restore();
      throw new BadGatewayException('Station image storage is unavailable', {
        cause: error,
      });
    }

    return restore;
  }

  getImage(
    category: string,
    filename: string,
    abortSignal?: AbortSignal,
  ): Promise<StationImageObject> {
    return this.getObject(this.getImageObjectKey(category, filename), abortSignal);
  }

  onModuleDestroy(): void {
    this.s3Client?.destroy();
  }

  private async getObject(
    key: string,
    abortSignal?: AbortSignal,
  ): Promise<StationImageObject> {
    if (!this.s3Client) {
      throw new ServiceUnavailableException(
        'Station image storage is not configured',
      );
    }
    const bucket = this.config.get<string>('S3_BUCKET');
    if (!bucket) {
      throw new ServiceUnavailableException(
        'Station image storage is not configured',
      );
    }

    try {
      const result = await this.s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { abortSignal },
      );
      const body = toNodeReadable(result.Body);
      if (!body) {
        throw new Error('The object storage response did not contain a stream');
      }

      return {
        body,
        contentLength: result.ContentLength,
        etag: result.ETag,
        lastModified: result.LastModified,
      };
    } catch (error) {
      if (abortSignal?.aborted) {
        throw error;
      }
      const statusCode = getStatusCode(error);
      if (statusCode === 404 || getErrorName(error) === 'NoSuchKey') {
        throw new NotFoundException('Station image not found');
      }

      this.logger.warn(
        `Station image storage request failed for ${key}${statusCode ? ` (upstream status ${statusCode})` : ''}`,
      );
      throw new BadGatewayException('Station image storage is unavailable');
    }
  }

  private requireStorage(): { client: S3Client; bucket: string } {
    const bucket = this.config.get<string>('S3_BUCKET');
    if (!this.s3Client || !bucket) {
      throw new ServiceUnavailableException(
        'Station image storage is not configured',
      );
    }
    return { client: this.s3Client, bucket };
  }
}

export function createStationImagesS3Client(
  config: ConfigService,
): S3Client | null {
  const endpoint = config.get<string>('S3_ENDPOINT');
  const bucket = config.get<string>('S3_BUCKET');
  const accessKeyId = config.get<string>('S3_ACCESS_KEY_ID');
  const secretAccessKey = config.get<string>('S3_SECRET_ACCESS_KEY');
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    endpoint,
    region: config.get<string>('S3_REGION') ?? 'us-east-1',
    forcePathStyle: true,
    maxAttempts: 2,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 2_500,
      requestTimeout: 10_000,
    }),
    credentials: { accessKeyId, secretAccessKey },
  });
}

function toNodeReadable(body: unknown): Readable | undefined {
  return body instanceof Readable ? body : undefined;
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('$metadata' in error)) {
    return undefined;
  }
  const metadata = error['$metadata'];
  return typeof metadata === 'object' &&
    metadata !== null &&
    'httpStatusCode' in metadata &&
    typeof metadata['httpStatusCode'] === 'number'
    ? metadata['httpStatusCode']
    : undefined;
}

function getErrorName(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error['name'] === 'string'
    ? error['name']
    : undefined;
}

async function readLimitedBody(body: Readable, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > limit) {
      body.destroy();
      throw new ServiceUnavailableException(
        'Station image exceeds the safe storage cleanup limit',
      );
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}
