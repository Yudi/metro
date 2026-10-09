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
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
    });
    if (rows.length === 0) {
      throw new ServiceUnavailableException(
        'Station image metadata is not configured',
      );
    }

    const stations = new Map<string, StationImage[]>();
    for (const row of rows) {
      const images = stations.get(row.stationIdentity) ?? [];
      images.push({
        key: row.key,
        label: row.label ?? undefined,
        lineIds: row.lineIds.length > 0 ? row.lineIds : undefined,
        service: row.service === 'train' ? 'train' : undefined,
        author: row.author,
        title: row.title,
        sourceUrl: row.sourceUrl,
        license: row.license,
        licenseUrl: row.licenseUrl ?? undefined,
      });
      stations.set(row.stationIdentity, images);
    }

    const manifest: StationImageManifest = {
      version: 1,
      stations: Object.fromEntries(stations),
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
