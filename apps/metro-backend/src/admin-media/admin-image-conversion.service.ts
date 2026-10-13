import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import { MAX_STATION_IMAGE_BYTES } from '../station-images/station-images.service';
import { assertAvifImage } from './admin-media.validation';

const MAX_INPUT_PIXELS = 50_000_000;
const MAX_OUTPUT_DIMENSION = 2048;
const MAX_CONCURRENT_CONVERSIONS = 2;
const CONVERSION_TIMEOUT_SECONDS = 20;
const ACCEPTED_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp']);
type SharpMetadata = Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;

@Injectable()
export class AdminImageConversionService {
  private activeConversions = 0;

  async convertToAvif(input: Buffer): Promise<Buffer> {
    if (!Buffer.isBuffer(input) || input.length < 12) {
      throw new BadRequestException('Upload must contain a supported raster image');
    }
    if (input.length > MAX_STATION_IMAGE_BYTES) {
      throw new PayloadTooLargeException('Station images cannot exceed 10 MiB');
    }
    if (this.activeConversions >= MAX_CONCURRENT_CONVERSIONS) {
      throw new HttpException(
        'Image conversion is busy; retry the upload shortly',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.activeConversions += 1;
    let decodedHeif = false;
    try {
      const image = sharp(input, {
        failOn: 'warning',
        limitInputPixels: MAX_INPUT_PIXELS,
        limitInputChannels: 4,
        sequentialRead: true,
      }).timeout({ seconds: CONVERSION_TIMEOUT_SECONDS });
      const metadata = await image.metadata();
      decodedHeif = metadata.format === 'heif' && metadata.compression === 'hevc';
      assertSupportedSingleFrameImage(metadata);

      const { data } = await image
        .rotate()
        .resize(MAX_OUTPUT_DIMENSION, MAX_OUTPUT_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toColourspace('srgb')
        .avif({
          quality: 50,
          effort: 6,
          chromaSubsampling: '4:4:4',
          bitdepth: 8,
        })
        .toBuffer({ resolveWithObject: true });

      if (data.length > MAX_STATION_IMAGE_BYTES) {
        throw new PayloadTooLargeException(
          'Converted AVIF images cannot exceed 10 MiB',
        );
      }
      assertAvifImage(data);
      return data;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof PayloadTooLargeException ||
        (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) ||
        error instanceof UnsupportedMediaTypeException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      if (isTimeoutError(error)) {
        throw new ServiceUnavailableException(
          'Image conversion exceeded its processing time limit',
        );
      }
      if (decodedHeif || isHeicContainer(input)) {
        throw new UnsupportedMediaTypeException(
          'This Sharp installation cannot decode HEIC/HEVC images; upload JPEG, PNG, WebP, or AVIF instead',
        );
      }
      throw new BadRequestException(
        'Upload must be a valid, single-frame JPEG, PNG, WebP, or AVIF image',
      );
    } finally {
      this.activeConversions -= 1;
    }
  }

}

function assertSupportedSingleFrameImage(metadata: SharpMetadata): void {
  const format = String(metadata.format);
  const isAvif = format === 'avif' ||
    (metadata.format === 'heif' && metadata.compression === 'av1');
  const isDecodableHeif = metadata.format === 'heif';
  if (!ACCEPTED_INPUT_FORMATS.has(format) && !isAvif && !isDecodableHeif) {
    throw new UnsupportedMediaTypeException(
      'Only JPEG, PNG, WebP, AVIF, and decoder-supported HEIC images are supported',
    );
  }
  if (metadata.pages !== undefined && metadata.pages > 1) {
    throw new UnsupportedMediaTypeException(
      'Animated and multi-page images are not supported',
    );
  }
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && /timeout|timed out/i.test(error.message);
}

function isHeicContainer(input: Buffer): boolean {
  if (input.length < 16 || input.toString('ascii', 4, 8) !== 'ftyp') {
    return false;
  }
  const declaredSize = input.readUInt32BE(0);
  const headerSize = declaredSize === 1 ? 16 : 8;
  const boxSize = declaredSize === 1 && input.length >= 24
    ? Number(input.readBigUInt64BE(8))
    : declaredSize === 0
      ? input.length
      : declaredSize;
  if (boxSize < headerSize + 8 || boxSize > input.length) {
    return false;
  }
  const brands = [input.toString('ascii', headerSize, headerSize + 4)];
  for (let offset = headerSize + 8; offset + 4 <= boxSize; offset += 4) {
    brands.push(input.toString('ascii', offset, offset + 4));
  }
  return brands.some((brand) =>
    ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'].includes(brand),
  );
}
