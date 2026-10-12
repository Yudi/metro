import type {
  AdminAccount,
  AdminImageEntry,
  ImageCopyright,
  MediaResource,
} from '../lib/shared-admin-contracts';

/** Synthetic records shared by stories, unit tests, and HTTP/browser tests. */
/** A generated 64 × 32 RGBA raster; real PNG bytes suitable for Sharp decoding. */
export const IMAGE_PNG_FIXTURE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAbUlEQVRogeXOIQEAIBAAsYvxAYmIp9rHmEDMrzn3/Swd0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0NIBLR3Q0gEtHdDSAS0d0BYbc3jiCS0yGQAAAABJRU5ErkJggg==';

export const ADMIN_ACCOUNT_FIXTURE: AdminAccount = {
  uid: 'admin-fixture',
  email: 'administrador@example.test',
  displayName: 'Administrador de teste',
  bootstrap: true,
};

export const REGULAR_ACCOUNT_FIXTURE: AdminAccount = {
  uid: 'editor-fixture',
  email: 'editor@example.test',
  displayName: 'Editor de teste',
  bootstrap: false,
};

export const COPYRIGHT_FIXTURE: ImageCopyright = {
  id: 'copyright-fixture',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
};

export const MEDIA_STATION_FIXTURE: MediaResource = {
  kind: 'station',
  identity: 'luz',
  name: 'Luz',
  scopes: [
    { id: '1', label: 'Linha 1 · Azul' },
    { id: '4', label: 'Linha 4 · Amarela' },
  ],
};

export const MEDIA_STOP_FIXTURE: MediaResource = {
  kind: 'stop',
  identity: 'stop:sptrans:10001',
  name: 'Parada de teste',
  scopes: [],
};

export const MEDIA_TERMINAL_FIXTURE: MediaResource = {
  kind: 'terminal',
  identity: 'terminal:central',
  name: 'Terminal Central',
  scopes: [
    { id: 'sptrans:10001', label: 'Plataforma 1' },
    { id: 'sptrans:10002', label: 'Plataforma 2' },
  ],
};

export const IMAGE_ENTRY_FIXTURE: AdminImageEntry = {
  key: 'station-images/metro/example.avif',
  stationIdentity: MEDIA_STATION_FIXTURE.identity,
  position: 0,
  copyrightId: COPYRIGHT_FIXTURE.id,
  title: 'Estação Luz - imagem de teste',
  label: 'Vista da estação',
  sourceUrl: 'https://example.com/photos/luz',
  author: 'Fotógrafo de teste',
  license: COPYRIGHT_FIXTURE.license,
  licenseUrl: COPYRIGHT_FIXTURE.licenseUrl,
  lineIds: [],
  stopIds: [],
  isDefault: true,
};
