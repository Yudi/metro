export type RailDatasetSource = 'geosampa' | 'sptrans';

export interface RailLineDatasetConfig {
  readonly lineCode: number;
  readonly source: RailDatasetSource;
  readonly gtfsRouteIds: readonly string[];
/** Add missing stations without changing the selected source's geometry. */
  readonly supplementalStationNames?: readonly string[];
}

/**
 * Select one source per line for stations and track geometry. Restart after a
 * source change. An empty source falls back for the whole line; datasets are
 * never mixed. List route IDs explicitly because L17 has two branches.
 */
export const RAIL_DATASETS: readonly RailLineDatasetConfig[] = [
  { lineCode: 1, source: 'geosampa', gtfsRouteIds: ['METRÔ L1'] },
  { lineCode: 2, source: 'geosampa', gtfsRouteIds: ['METRÔ L2'] },
  { lineCode: 3, source: 'geosampa', gtfsRouteIds: ['METRÔ L3'] },
  { lineCode: 4, source: 'geosampa', gtfsRouteIds: ['METRÔ L4'] },
  { lineCode: 5, source: 'geosampa', gtfsRouteIds: ['METRÔ L5'] },
  { lineCode: 6, source: 'sptrans', gtfsRouteIds: ['METRÔ L6'] },
  { lineCode: 7, source: 'geosampa', gtfsRouteIds: ['CPTM L07'] },
  { lineCode: 8, source: 'geosampa', gtfsRouteIds: ['CPTM L08'] },
  { lineCode: 9, source: 'geosampa', gtfsRouteIds: ['CPTM L09'] },
  { lineCode: 10, source: 'geosampa', gtfsRouteIds: ['CPTM L10'] },
  { lineCode: 11, source: 'geosampa', gtfsRouteIds: ['CPTM L11'] },
  { lineCode: 12, source: 'geosampa', gtfsRouteIds: ['CPTM L12'] },
  { lineCode: 13, source: 'geosampa', gtfsRouteIds: ['CPTM L13'] },
  {
    lineCode: 15,
    source: 'geosampa',
    gtfsRouteIds: ['METRÔ 15'],
    supplementalStationNames: ['Jardim Colonial'],
  },
  {
    lineCode: 17,
    source: 'sptrans',
    gtfsRouteIds: ['METRÔ17A', 'METRÔ17W'],
  },
];

/** Bump when station matching behavior changes. */
export const RAIL_DATASET_SIGNATURE = `v1:${JSON.stringify(RAIL_DATASETS)}`;
