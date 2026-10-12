export interface StationImage {
  readonly key: string;
  readonly label?: string;
  readonly lineIds?: readonly string[];
  readonly stopIds?: readonly string[];
  readonly service?: 'train';
  readonly isDefault?: boolean;
  readonly author: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly license: string;
  readonly licenseUrl?: string;
}

export interface StationImageManifest {
  readonly version: 1;
  readonly stations: Readonly<Record<string, readonly StationImage[]>>;
  /** Optional images keyed by the full namespaced GTFS stop identity. */
  readonly stops?: Readonly<Record<string, readonly StationImage[]>>;
  /** Optional images keyed by the full dynamic catalog ID, such as terminal:central. */
  readonly terminals?: Readonly<Record<string, readonly StationImage[]>>;
}
