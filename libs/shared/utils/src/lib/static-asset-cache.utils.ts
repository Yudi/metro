const HASHED_ASSET_PATTERN = /^(?:chunk|main|polyfills|styles)-[\w-]{8,}\.(?:css|js)$/i;

/** Cache policy for a static asset's basename, excluding its directory. */
export function getStaticAssetCacheControl(fileName: string): string {
  return HASHED_ASSET_PATTERN.test(fileName)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}
