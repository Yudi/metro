import {
  COPYRIGHT_FIXTURE,
  MEDIA_STATION_FIXTURE,
  MEDIA_STOP_FIXTURE,
  MEDIA_TERMINAL_FIXTURE,
} from '@metro/shared/admin-contracts';
import { adminImageFileError, createAdminImageInput } from './admin-image-input';

const baseValue = {
  author: 'Autora de teste',
  title: 'Imagem de teste',
  label: 'Vista externa',
  sourceUrl: 'https://example.test/imagem',
  copyrightId: COPYRIGHT_FIXTURE.id,
  isDefault: false,
};

describe('admin image input', () => {
  it('keeps line-specific station associations and explicit default selection separate', () => {
    const input = createAdminImageInput(MEDIA_STATION_FIXTURE, {
      ...baseValue,
      lineIds: ['1'],
      stopIds: ['sptrans:10001'],
      isDefault: false,
    });

    expect(input.stationIdentity).toBe(MEDIA_STATION_FIXTURE.identity);
    expect(input.lineIds).toEqual(['1']);
    expect(input).not.toHaveProperty('stopIds');
    expect(input.isDefault).toBe(false);
  });

  it('sends terminal platform scopes and never includes station lines', () => {
    const input = createAdminImageInput(MEDIA_TERMINAL_FIXTURE, {
      ...baseValue,
      lineIds: ['1'],
      stopIds: ['sptrans:10001'],
      isDefault: false,
    });

    expect(input.stationIdentity).toBe(MEDIA_TERMINAL_FIXTURE.identity);
    expect(input.stopIds).toEqual(['sptrans:10001']);
    expect(input).not.toHaveProperty('lineIds');
  });

  it('sends an individual stop identity without adding stop scopes', () => {
    const input = createAdminImageInput(MEDIA_STOP_FIXTURE, {
      ...baseValue,
      lineIds: ['1'],
      stopIds: ['sptrans:10001'],
      isDefault: false,
    });

    expect(input.stationIdentity).toBe(MEDIA_STOP_FIXTURE.identity);
    expect(input).not.toHaveProperty('lineIds');
    expect(input).not.toHaveProperty('stopIds');
  });

  it('preserves the train fallback for a station image', () => {
    const input = createAdminImageInput(MEDIA_STATION_FIXTURE, {
      ...baseValue,
      service: 'train',
    });

    expect(input.service).toBe('train');
    expect(input).not.toHaveProperty('lineIds');
  });

  it('makes an explicit default resource-wide even if stale form scopes remain', () => {
    const input = createAdminImageInput(MEDIA_TERMINAL_FIXTURE, {
      ...baseValue,
      lineIds: ['1'],
      stopIds: ['sptrans:10001'],
      isDefault: true,
    });

    expect(input.isDefault).toBe(true);
    expect(input).not.toHaveProperty('lineIds');
    expect(input).not.toHaveProperty('stopIds');
  });

  it('accepts JPEG, PNG, WebP, AVIF, HEIC, and HEIF files within the upload limit', () => {
    const supportedFiles = [
      new File(['jpeg fixture'], 'station.jpg', { type: 'image/jpeg' }),
      new File(['png fixture'], 'station.png', { type: 'image/png' }),
      new File(['webp fixture'], 'station.webp', { type: 'image/webp' }),
      new File(['avif fixture'], 'station.avif', { type: 'image/avif' }),
      new File(['heic fixture'], 'station.heic', { type: 'image/heic' }),
      new File(['heif fixture'], 'station.heif', { type: 'image/heif' }),
    ];

    for (const file of supportedFiles) {
      expect(adminImageFileError(file)).toBeNull();
    }
  });

  it('treats filename and MIME as advisory while rejecting unsupported image formats', () => {
    const supportedExtension = new File(['avif fixture'], 'station.avif', {
      type: 'image/png',
    });
    const supportedMime = new File(['png fixture'], 'station.data', {
      type: 'image/png',
    });
    const heicMime = new File(['heic fixture'], 'station.data', {
      type: 'image/heic',
    });
    const svg = new File(['<svg></svg>'], 'station.svg', {
      type: 'image/svg+xml',
    });
    const unsupportedFormat = new File(['fixture'], 'station.gif', {
      type: 'image/gif',
    });

    expect(adminImageFileError(supportedExtension)).toBeNull();
    expect(adminImageFileError(supportedMime)).toBeNull();
    expect(adminImageFileError(heicMime)).toBeNull();
    expect(adminImageFileError(svg)).toBe(
      'Selecione uma imagem JPEG, PNG, WebP, AVIF, HEIC ou HEIF.',
    );
    expect(adminImageFileError(unsupportedFormat)).toBe(
      'Selecione uma imagem JPEG, PNG, WebP, AVIF, HEIC ou HEIF.',
    );
  });

  it('rejects a supported image larger than 10 MiB', () => {
    const oversizedFile = new File(
      [new Uint8Array(10 * 1024 * 1024 + 1)],
      'station.png',
      { type: 'image/png' },
    );

    expect(adminImageFileError(oversizedFile)).toBe(
      'O arquivo deve ter no máximo 10 MiB.',
    );
  });
});
