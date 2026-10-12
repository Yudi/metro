import { InjectionToken } from '@angular/core';
import type { MediaResource } from '@metro/shared/admin-contracts';
import { isStationImageFileKey } from '../map-main/components/subway-station-dialog/station-images';

/** Optional image source override for isolated component previews such as Storybook. */
export const ADMIN_IMAGE_PREVIEW_URL = new InjectionToken<string | null>(
  'ADMIN_IMAGE_PREVIEW_URL',
  { providedIn: 'root', factory: () => null },
);

export function resolveAdminImagePreviewUrl(
  key: string,
  category: MediaResource['kind'],
  apiUrl: string,
  previewUrl: string | null,
): string | null {
  if (!isStationImageFileKey(key, category)) return null;
  return previewUrl ||
    `${apiUrl}/media/station-images/files/${key.slice('station-images/'.length)}`;
}
