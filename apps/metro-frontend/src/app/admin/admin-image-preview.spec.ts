import { resolveAdminImagePreviewUrl } from './admin-image-preview';

describe('admin image preview URL', () => {
  it('uses the configured placeholder for valid image keys', () => {
    expect(
      resolveAdminImagePreviewUrl(
        'station-images/metro/example.avif',
        'station',
        '/api',
        'https://placehold.co/640x360?text=Estacao+Luz',
      ),
    ).toBe('https://placehold.co/640x360?text=Estacao+Luz');
  });

  it('keeps malformed storage keys out of previews', () => {
    expect(
      resolveAdminImagePreviewUrl(
        'https://example.test/image.avif',
        'station',
        '/api',
        'https://placehold.co/640x360?text=Estacao+Luz',
      ),
    ).toBeNull();
  });

  it('uses the public media endpoint when no preview override is configured', () => {
    expect(
      resolveAdminImagePreviewUrl(
        'station-images/stop/central-stop.avif',
        'stop',
        '/api',
        null,
      ),
    ).toBe('/api/media/station-images/files/stop/central-stop.avif');
  });
});
