export interface TransitCity {
  readonly id: string;
  readonly name: string;
  readonly timeZone: string;
  readonly locale: string;
  readonly siteTitle: string;
  readonly description: string;
  readonly map: {
    readonly center: { readonly latitude: number; readonly longitude: number };
    readonly zoom: number;
  };
  readonly searchPriorityCities: readonly string[];
}
