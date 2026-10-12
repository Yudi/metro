import type { AdminImageInput, MediaResource } from '@metro/shared/admin-contracts';

export const MAX_ADMIN_IMAGE_BYTES = 10 * 1024 * 1024;

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.heic',
  '.heif',
]);
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

export type AdminImageFormValue = Omit<
  AdminImageInput,
  'stationIdentity' | 'service'
> & { service?: AdminImageInput['service'] };

export function createAdminImageInput(
  resource: MediaResource,
  value: AdminImageFormValue,
): AdminImageInput {
  const { lineIds, stopIds, label, service, ...metadata } = value;
  const isDefault = metadata.isDefault;
  return {
    ...metadata,
    stationIdentity: resource.identity,
    ...(label?.trim() ? { label: label.trim() } : {}),
    ...(!isDefault && resource.kind === 'station' && service === 'train'
      ? { service }
      : {}),
    ...(!isDefault && resource.kind === 'station' && lineIds?.length
      ? { lineIds }
      : {}),
    ...(!isDefault && resource.kind === 'terminal' && stopIds?.length
      ? { stopIds }
      : {}),
  };
}

export function adminImageFileError(file: File): string | null {
  if (file.size > MAX_ADMIN_IMAGE_BYTES) {
    return 'O arquivo deve ter no máximo 10 MiB.';
  }
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  const mimeType = file.type.toLowerCase();
  if (
    !SUPPORTED_IMAGE_EXTENSIONS.has(extension) &&
    !SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)
  ) {
    return 'Selecione uma imagem JPEG, PNG, WebP, AVIF, HEIC ou HEIF.';
  }
  return null;
}
