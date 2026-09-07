import { getStaticAssetCacheControl } from './static-asset-cache.utils';

describe('static asset cache policy', () => {
  it.each([
    'main-ABCDEFGH.js',
    'chunk-12345678.js',
    'polyfills-abcd1234.js',
    'styles-abcd1234.css',
    'MAIN-ABCDEFGH.JS',
  ])('keeps fingerprinted bundle %s immutable', (fileName) => {
    expect(getStaticAssetCacheControl(fileName)).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it.each([
    'index.html',
    'ngsw.json',
    'ngsw-worker.js',
    'manifest.webmanifest',
    'main.js',
    'main-1234567.js',
    'logo-12345678.svg',
    'main-12345678.js.map',
  ])('revalidates %s', (fileName) => {
    expect(getStaticAssetCacheControl(fileName)).toBe('no-cache');
  });
});
