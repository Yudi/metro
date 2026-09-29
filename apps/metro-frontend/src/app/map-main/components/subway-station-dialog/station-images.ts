import type { StationImage } from '@metro/shared/station-image-contracts';
export type { StationImage, StationImageManifest } from '@metro/shared/station-image-contracts';

export interface StationHeaderImage extends StationImage {
  readonly src: string;
}

/** Explicit line assignments outrank service photos; manifest order is the fallback. */
export function selectStationImage(
  images: readonly StationImage[],
  lineId?: string | number | null,
): StationImage | undefined {
  const code = String(lineId ?? '').replace(/^L/i, '');
  const specific = images.find((image) => image.lineIds?.includes(code));
  if (specific) return specific;
  const isTrain = /^(?:[7-9]|1[0-4]|10X|EA|EJ)$/.test(code);
  return (isTrain ? images.find((image) => image.service === 'train') : undefined)
    ?? images[0];
}
