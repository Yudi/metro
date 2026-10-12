import {
  BadRequestException,
  HttpStatus,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import { IMAGE_PNG_FIXTURE_BASE64 } from '@metro/shared/admin-contracts';
import { MAX_STATION_IMAGE_BYTES } from '../station-images/station-images.service';
import { assertAvifImage } from './admin-media.validation';
import { AdminImageConversionService } from './admin-image-conversion.service';

describe('AdminImageConversionService', () => {
  it('converts PNG and AVIF inputs to valid AVIF while stripping metadata', async () => {
    const service = new AdminImageConversionService();
    const source = pngFixture();

    const avif = await service.convertToAvif(source);
    assertAvifImage(avif);
    const metadata = await sharp(avif).metadata();
    expect(
      String(metadata.format) === 'avif' ||
        (metadata.format === 'heif' && metadata.compression === 'av1'),
    ).toBe(true);
    expect(metadata.width).toBe(64);
    expect(metadata.height).toBe(32);
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();

    const reconverted = await service.convertToAvif(avif);
    assertAvifImage(reconverted);
    const reconvertedMetadata = await sharp(reconverted).metadata();
    expect(
      String(reconvertedMetadata.format) === 'avif' ||
        (reconvertedMetadata.format === 'heif' && reconvertedMetadata.compression === 'av1'),
    ).toBe(true);

    const webp = await sharp(source).webp().toBuffer();
    const webpOutput = await service.convertToAvif(webp);
    assertAvifImage(webpOutput);
  });

  it('auto-orients JPEG input and resizes large input without enlarging small images', async () => {
    const service = new AdminImageConversionService();
    const orientedJpeg = await sharp({
      create: {
        width: 48,
        height: 24,
        channels: 3,
        background: { r: 45, g: 80, b: 120 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const orientedOutput = await service.convertToAvif(orientedJpeg);
    const orientedMetadata = await sharp(orientedOutput).metadata();
    expect(orientedMetadata.width).toBe(24);
    expect(orientedMetadata.height).toBe(48);
    expect(orientedMetadata.orientation).toBeUndefined();

    const largePng = await sharp({
      create: {
        width: 2300,
        height: 1000,
        channels: 3,
        background: { r: 30, g: 40, b: 50 },
      },
    }).png().toBuffer();
    const resized = await service.convertToAvif(largePng);
    const resizedMetadata = await sharp(resized).metadata();
    expect(resizedMetadata.width).toBe(2048);
    expect(resizedMetadata.height).toBeLessThanOrEqual(2048);

    const small = await service.convertToAvif(pngFixture());
    const smallMetadata = await sharp(small).metadata();
    expect(smallMetadata.width).toBe(64);
    expect(smallMetadata.height).toBe(32);
  });

  it('rejects corrupt, unsupported, animated, HEIC without a decoder, and excessive-pixel input', async () => {
    const service = new AdminImageConversionService();
    await expect(service.convertToAvif(Buffer.from('corrupt'))).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.convertToAvif(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'),
      ),
    ).rejects.toThrow(UnsupportedMediaTypeException);

    const animatedWebp = await makeAnimatedWebp();
    await expect(service.convertToAvif(animatedWebp)).rejects.toThrow(
      UnsupportedMediaTypeException,
    );

    await expect(service.convertToAvif(heicContainer())).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
    await expect(service.convertToAvif(oversizedPngHeader())).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.convertToAvif(Buffer.alloc(MAX_STATION_IMAGE_BYTES + 1)),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('rejects excess simultaneous conversions instead of queueing uploads', async () => {
    const service = new AdminImageConversionService();
    Reflect.set(service, 'activeConversions', 2);

    await expect(service.convertToAvif(pngFixture())).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });
});

function pngFixture(): Buffer {
  return Buffer.from(IMAGE_PNG_FIXTURE_BASE64, 'base64');
}

async function makeAnimatedWebp(): Promise<Buffer> {
  const firstFrame = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 220, g: 40, b: 40 },
    },
  }).png().toBuffer();
  const secondFrame = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 40, g: 40, b: 220 },
    },
  }).png().toBuffer();
  return sharp([firstFrame, secondFrame], { join: { animated: true } })
    .webp({ delay: [100, 100], loop: 0 })
    .toBuffer();
}

function heicContainer(): Buffer {
  const input = Buffer.alloc(24);
  input.writeUInt32BE(24, 0);
  input.write('ftyp', 4, 'ascii');
  input.write('heic', 8, 'ascii');
  input.writeUInt32BE(0, 12);
  input.write('mif1', 16, 'ascii');
  input.write('heic', 20, 'ascii');
  return input;
}

function oversizedPngHeader(): Buffer {
  const input = pngFixture();
  input.writeUInt32BE(10_000, 16);
  input.writeUInt32BE(6_000, 20);
  input.writeUInt32BE(crc32(input.subarray(12, 29)), 29);
  return input;
}

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
