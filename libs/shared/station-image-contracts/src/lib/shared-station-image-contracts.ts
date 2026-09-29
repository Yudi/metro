export interface StationImage {
  readonly key: string;
  readonly label?: string;
  readonly lineIds?: readonly string[];
  readonly service?: 'train';
  readonly author: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly license: string;
  readonly licenseUrl?: string;
}

export interface StationImageManifest {
  readonly version: 1;
  readonly stations: Readonly<Record<string, readonly StationImage[]>>;
}

