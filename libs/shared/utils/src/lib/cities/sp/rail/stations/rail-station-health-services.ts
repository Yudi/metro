import { getStaticRailStationsByLine } from './rail-stations.entity';
import { hardNormalizeString } from '../../../../common/strings.utils';

export type StationHealthServiceLineCode =
  | 'L1'
  | 'L2'
  | 'L3'
  | 'L4'
  | 'L5'
  | 'L11'
  | 'L12'
  | 'L15';

export enum StationHealthServiceType {
  PrepPepMachine = 'prep-pep-machine',
  Condoms = 'condoms',
  PreventionCenter = 'prevention-center',
}

export enum StationHealthServiceArea {
  Paid = 'paid-area',
  Free = 'free-area',
}

export interface StationHealthServiceRecord {
  readonly lineCode: StationHealthServiceLineCode;
  readonly stationName: string;
  readonly type: StationHealthServiceType;
  readonly area?: StationHealthServiceArea;
  readonly details?: readonly string[];
}

type StationHealthServiceTuple = readonly [
  lineCode: StationHealthServiceLineCode,
  stationName: string,
  type: StationHealthServiceType,
  area?: StationHealthServiceArea,
  details?: readonly string[],
];

const T = StationHealthServiceType;
const A = StationHealthServiceArea;
const SERVICE_PRIORITY: Record<StationHealthServiceType, number> = {
  [T.PrepPepMachine]: 0,
  [T.PreventionCenter]: 1,
  [T.Condoms]: 2,
};

const STATION_HEALTH_SERVICE_DATA = [
  ['L1', 'Jabaquara', T.Condoms],
  ['L1', 'Tucuruvi', T.Condoms],
  ['L1', 'São Joaquim', T.Condoms],

  ['L2', 'Vila Madalena', T.Condoms],
  ['L2', 'Consolação', T.Condoms],
  ['L2', 'Paraíso', T.Condoms, A.Paid],
  ['L2', 'Tamanduateí', T.Condoms],

  ['L3', 'Corinthians-Itaquera', T.Condoms],
  ['L3', 'Tatuapé', T.Condoms],
  ['L3', 'Brás', T.Condoms],
  ['L3', 'República', T.Condoms],
  ['L3', 'Artur Alvim', T.Condoms],
  ['L3', 'Guilhermina-Esperança', T.Condoms],
  ['L3', 'Vila Matilde', T.Condoms],
  ['L3', 'Anhangabaú', T.Condoms],

  ['L4', 'Vila Sônia', T.Condoms],
  ['L4', 'São Paulo-Morumbi', T.Condoms],
  ['L4', 'Butantã', T.Condoms],
  ['L4', 'Pinheiros', T.Condoms],
  ['L4', 'Faria Lima', T.Condoms],
  ['L4', 'Fradique Coutinho', T.Condoms],
  ['L4', 'Oscar Freire', T.Condoms],
  ['L4', 'Paulista', T.Condoms],
  ['L4', 'Higienópolis-Mackenzie', T.Condoms],
  ['L4', 'República', T.Condoms],
  ['L4', 'Luz', T.Condoms],

  ['L5', 'Capão Redondo', T.Condoms],
  ['L5', 'Campo Limpo', T.Condoms],
  ['L5', 'Vila das Belezas', T.Condoms],
  ['L5', 'Giovanni Gronchi', T.Condoms],
  ['L5', 'Santo Amaro', T.Condoms],
  ['L5', 'Largo Treze', T.Condoms],
  ['L5', 'Adolfo Pinheiro', T.Condoms],
  ['L5', 'Alto da Boa Vista', T.Condoms],
  ['L5', 'Borba Gato', T.Condoms],
  ['L5', 'Brooklin', T.Condoms],
  ['L5', 'Campo Belo', T.Condoms],
  ['L5', 'Eucaliptos', T.Condoms],
  ['L5', 'Moema', T.Condoms],
  ['L5', 'AACD-Servidor', T.Condoms],
  ['L5', 'Hospital São Paulo', T.Condoms],
  ['L5', 'Santa Cruz', T.Condoms],
  ['L5', 'Chácara Klabin', T.Condoms],

  ['L11', 'Guaianases', T.Condoms, A.Paid],
  ['L12', 'São Miguel Paulista', T.Condoms],
  ['L12', 'Engenheiro Goulart', T.Condoms],
  ['L12', 'Jardim Helena-Vila Mara', T.Condoms],
  ['L15', 'Sapopemba', T.Condoms],
  ['L15', 'São Mateus', T.Condoms],

  ['L2', 'Brigadeiro', T.PrepPepMachine],
  ['L2', 'Consolação', T.PrepPepMachine, A.Free],
  ['L1', 'Santana', T.PrepPepMachine, A.Paid],
  ['L4', 'Luz', T.PrepPepMachine, A.Paid],
  ['L4', 'Vila Sônia', T.PrepPepMachine],
  ['L3', 'Brás', T.PrepPepMachine, A.Paid],

  [
    'L3',
    'República',
    T.PreventionCenter,
    A.Paid,
    [
      'preservativos internos e externos',
      'gel lubrificante',
      'autoteste de HIV',
      'terça a sábado, 17h às 23h',
    ],
  ],
] as const satisfies readonly StationHealthServiceTuple[];

export const STATION_HEALTH_SERVICE_RECORDS: readonly StationHealthServiceRecord[] =
  STATION_HEALTH_SERVICE_DATA.map(
    ([lineCode, stationName, type, area, details]) => ({
      lineCode,
      stationName,
      type,
      ...(area ? { area } : {}),
      ...(details ? { details } : {}),
    }),
  );

export function resolveStationHealthServices(
  stationName: string,
  lineCodes: readonly (string | number)[],
): readonly StationHealthServiceRecord[] {
  const normalizedStationNames = new Set([
    hardNormalizeString(stationName),
    ...lineCodes.flatMap((lineCode) => {
      const normalizedLineCode = normalizeLineCode(lineCode);
      const staticStation = getStaticRailStationsByLine(
        normalizedLineCode,
      )?.find((station) => stationMatches(stationName, station));
      return staticStation ? [hardNormalizeString(staticStation.name)] : [];
    }),
  ]);

  // Station-wide services should appear for every line in an interchange.
  const services = STATION_HEALTH_SERVICE_RECORDS.filter((record) =>
    normalizedStationNames.has(hardNormalizeString(record.stationName)),
  );

  const seen = new Set<string>();
  const uniqueServices = services.filter((service) => {
    const key = [
      service.type,
      service.area ?? '',
      ...(service.details ?? []),
    ].join('\u0000');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return uniqueServices.sort(
    (a, b) => SERVICE_PRIORITY[a.type] - SERVICE_PRIORITY[b.type],
  );
}

function normalizeLineCode(lineCode: string | number): string {
  const value = String(lineCode).trim().toUpperCase();
  const match = /^L?0*(\d+)$/.exec(value);
  return match ? `L${Number(match[1])}` : value;
}

function stationMatches(
  stationNameOrCode: string,
  station: {
    readonly code: string;
    readonly name: string;
    readonly alternativeNames?: readonly string[];
  },
): boolean {
  if (station.code.toLowerCase() === stationNameOrCode.trim().toLowerCase()) {
    return true;
  }

  const normalizedName = hardNormalizeString(stationNameOrCode);
  return [station.name, ...(station.alternativeNames ?? [])].some(
    (candidate) => hardNormalizeString(candidate) === normalizedName,
  );
}
