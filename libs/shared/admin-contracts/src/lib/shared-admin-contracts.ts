import type { StationImage } from '@metro/shared/station-image-contracts';

export interface AdminAccount {
  readonly uid: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly bootstrap: boolean;
}

export interface ImageCopyright {
  readonly id: string;
  readonly license: string;
  readonly licenseUrl?: string;
}

export type ImageCopyrightInput = Omit<ImageCopyright, 'id'>;

export interface MediaResource {
  readonly kind: 'station' | 'stop' | 'terminal';
  readonly identity: string;
  readonly name: string;
  readonly scopes: readonly { readonly id: string; readonly label: string }[];
}

export interface AdminImageEntry extends StationImage {
  readonly stationIdentity: string;
  readonly position: number;
  readonly copyrightId: string | null;
  readonly stopIds: readonly string[];
  readonly isDefault: boolean;
}

export interface AdminImageInput {
  readonly stationIdentity: string;
  readonly author: string;
  readonly title: string;
  readonly label?: string;
  readonly sourceUrl: string;
  readonly copyrightId: string;
  readonly lineIds?: readonly string[];
  readonly stopIds?: readonly string[];
  readonly service?: 'train';
  readonly isDefault: boolean;
}
