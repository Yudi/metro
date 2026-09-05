import { getStaticRailStationsByLine } from './rail-stations.entity';
import { hardNormalizeString } from './strings.utils';

export enum StationBathroomStatus {
  PaidArea = 'paid-area',
  FreeArea = 'free-area',
  PaidAndFreeAreas = 'paid-and-free-areas',
  AvailableLocationUnknown = 'available-location-unknown',
  Unavailable = 'unavailable',
  Unknown = 'unknown',
}

export type StationBathroomLineCode =
  | 'L1'
  | 'L2'
  | 'L3'
  | 'L4'
  | 'L5'
  | 'L6'
  | 'L7'
  | 'L8'
  | 'L9'
  | 'L10'
  | 'L11'
  | 'L12'
  | 'L13'
  | 'L15'
  | 'L17';

export interface StationBathroomRecord {
  readonly lineCode: StationBathroomLineCode;
  readonly stationName: string;
  readonly status: StationBathroomStatus;
  readonly note?: string;
}

export interface ResolvedStationBathroomInfo {
  readonly status: Exclude<
    StationBathroomStatus,
    StationBathroomStatus.Unknown
  >;
  readonly notes: readonly string[];
}

type StationBathroomTuple = readonly [
  lineCode: StationBathroomLineCode,
  stationName: string,
  status: StationBathroomStatus,
  note?: string,
];

const S = StationBathroomStatus;

const STATION_BATHROOM_DATA = [
  // Linha 1 - Azul
  ['L1', 'Tucuruvi', S.FreeArea],
  ['L1', 'Parada Inglesa', S.FreeArea],
  ['L1', 'Jardim São Paulo', S.Unavailable],
  ['L1', 'Santana', S.AvailableLocationUnknown],
  ['L1', 'Carandiru', S.Unavailable],
  ['L1', 'Portuguesa-Tietê', S.FreeArea, 'Terminal Rodoviário'],
  ['L1', 'Armênia', S.FreeArea, 'Terminal'],
  ['L1', 'Tiradentes', S.Unavailable],
  ['L1', 'Luz', S.PaidArea],
  ['L1', 'São Bento', S.PaidArea],
  ['L1', 'Sé', S.PaidArea],
  ['L1', 'Japão-Liberdade', S.Unavailable],
  ['L1', 'São Joaquim', S.Unavailable],
  ['L1', 'Vergueiro', S.Unavailable],
  ['L1', 'Paraíso', S.FreeArea],
  ['L1', 'Ana Rosa', S.FreeArea, 'Terminal'],
  ['L1', 'Vila Mariana', S.FreeArea, 'Terminal'],
  [
    'L1',
    'Santa Cruz',
    S.PaidAndFreeAreas,
    'Opção no shopping conectado à Linha Azul',
  ],
  ['L1', 'Praça da Árvore', S.Unavailable],
  ['L1', 'Saúde', S.Unavailable],
  ['L1', 'São Judas', S.Unavailable],
  ['L1', 'Conceição', S.FreeArea],
  ['L1', 'Jabaquara', S.FreeArea, 'Terminal Rodoviário'],

  // Linha 2 - Verde
  ['L2', 'Vila Madalena', S.FreeArea, 'Terminal'],
  ['L2', 'Sumaré', S.Unavailable],
  ['L2', 'Clínicas', S.PaidArea],
  ['L2', 'Consolação', S.PaidArea, 'Corredor de integração com a Linha 4'],
  ['L2', 'Trianon-Masp', S.PaidArea],
  ['L2', 'Brigadeiro', S.PaidArea],
  ['L2', 'Paraíso', S.FreeArea],
  ['L2', 'Ana Rosa', S.FreeArea],
  ['L2', 'Chácara Klabin', S.PaidArea, 'Na integração com a Linha 5'],
  ['L2', 'Santos-Imigrantes', S.Unavailable],
  ['L2', 'Alto do Ipiranga', S.Unavailable],
  ['L2', 'Sacomã', S.FreeArea],
  ['L2', 'Tamanduateí', S.PaidAndFreeAreas],
  ['L2', 'Vila Prudente', S.PaidAndFreeAreas],

  // Linha 3 - Vermelha
  [
    'L3',
    'Palmeiras-Barra Funda',
    S.PaidAndFreeAreas,
    'No complexo ferroviário e no terminal',
  ],
  ['L3', 'Marechal Deodoro', S.Unavailable],
  ['L3', 'Santa Cecília', S.Unavailable],
  [
    'L3',
    'República',
    S.PaidArea,
    'Acesso pelo complexo da Linha 4',
  ],
  ['L3', 'Anhangabaú', S.Unavailable],
  ['L3', 'Sé', S.PaidArea],
  ['L3', 'Pedro II', S.FreeArea],
  [
    'L3',
    'Brás',
    S.PaidAndFreeAreas,
    'No complexo ferroviário e no terminal externo',
  ],
  ['L3', 'Bresser-Mooca', S.Unavailable],
  ['L3', 'Belém', S.FreeArea, 'Terminal'],
  ['L3', 'Tatuapé', S.FreeArea, 'Terminal'],
  ['L3', 'Carrão', S.FreeArea, 'Terminal'],
  ['L3', 'Penha', S.FreeArea, 'Terminais'],
  ['L3', 'Vila Matilde', S.FreeArea, 'Terminal'],
  ['L3', 'Guilhermina-Esperança', S.FreeArea, 'Terminais'],
  ['L3', 'Patriarca-Vila Ré', S.FreeArea, 'Terminais'],
  ['L3', 'Artur Alvim', S.FreeArea, 'Terminal'],
  ['L3', 'Corinthians-Itaquera', S.FreeArea, 'Terminal'],

  // Linha 4 - Amarela
  ['L4', 'Luz', S.PaidArea],
  ['L4', 'República', S.PaidArea],
  ['L4', 'Higienópolis-Mackenzie', S.PaidArea],
  ['L4', 'Paulista', S.PaidArea],
  ['L4', 'Oscar Freire', S.FreeArea],
  ['L4', 'Fradique Coutinho', S.PaidArea],
  ['L4', 'Faria Lima', S.PaidArea],
  ['L4', 'Pinheiros', S.PaidArea],
  ['L4', 'Butantã', S.FreeArea],
  ['L4', 'São Paulo-Morumbi', S.PaidAndFreeAreas],
  ['L4', 'Vila Sônia', S.PaidAndFreeAreas],

  // Linha 5 - Lilás
  ['L5', 'Chácara Klabin', S.PaidArea],
  [
    'L5',
    'Santa Cruz',
    S.PaidAndFreeAreas,
    'Opção no shopping conectado à Linha Azul',
  ],
  ['L5', 'Hospital São Paulo', S.PaidArea],
  ['L5', 'AACD-Servidor', S.PaidArea],
  ['L5', 'Moema', S.PaidArea],
  ['L5', 'Eucaliptos', S.PaidArea],
  ['L5', 'Campo Belo', S.PaidArea],
  ['L5', 'Brooklin', S.PaidArea],
  ['L5', 'Borba Gato', S.PaidArea],
  ['L5', 'Alto da Boa Vista', S.PaidArea],
  ['L5', 'Adolfo Pinheiro', S.PaidArea],
  ['L5', 'Largo Treze', S.FreeArea],
  ['L5', 'Santo Amaro', S.PaidAndFreeAreas],
  ['L5', 'Giovanni Gronchi', S.FreeArea, 'Terminal João Dias'],
  ['L5', 'Vila das Belezas', S.Unknown],
  ['L5', 'Campo Limpo', S.FreeArea],
  ['L5', 'Capão Redondo', S.FreeArea],

  // Linha 6 - Laranja
  ['L6', 'João Paulo I', S.AvailableLocationUnknown],
  ['L6', 'Freguesia do Ó', S.AvailableLocationUnknown],
  ['L6', 'Santa Marina', S.AvailableLocationUnknown],
  ['L6', 'Água Branca', S.AvailableLocationUnknown],
  ['L6', 'SESC-Pompeia', S.AvailableLocationUnknown],
  ['L6', 'Perdizes', S.AvailableLocationUnknown],

  // Linha 7 - Rubi
  [
    'L7',
    'Palmeiras-Barra Funda',
    S.PaidAndFreeAreas,
    'No complexo ferroviário e no terminal',
  ],
  ['L7', 'Água Branca', S.PaidArea],
  ['L7', 'Lapa', S.PaidArea],
  ['L7', 'Piqueri', S.PaidArea],
  ['L7', 'Pirituba', S.PaidArea],
  ['L7', 'Vila Clarice', S.PaidArea],
  ['L7', 'Jaraguá', S.PaidArea],
  ['L7', 'Vila Aurora', S.PaidArea],
  ['L7', 'Perus', S.PaidArea],
  ['L7', 'Caieiras', S.PaidArea],
  ['L7', 'Franco da Rocha', S.PaidArea],
  ['L7', 'Baltazar Fidélis', S.PaidArea],
  ['L7', 'Francisco Morato', S.PaidArea],
  ['L7', 'Botujuru', S.PaidArea],
  ['L7', 'Campo Limpo Paulista', S.PaidArea],
  ['L7', 'Várzea Paulista', S.PaidArea],
  ['L7', 'Jundiaí', S.AvailableLocationUnknown],

  // Linha 8 - Diamante
  ['L8', 'Júlio Prestes', S.PaidArea],
  [
    'L8',
    'Palmeiras-Barra Funda',
    S.PaidAndFreeAreas,
    'No complexo ferroviário e no terminal',
  ],
  ['L8', 'Lapa', S.PaidArea],
  ['L8', 'Domingos de Moraes', S.PaidArea],
  ['L8', 'Imperatriz Leopoldina', S.AvailableLocationUnknown],
  ['L8', 'Presidente Altino', S.PaidArea],
  ['L8', 'Osasco', S.PaidArea],
  ['L8', 'Comandante Sampaio', S.PaidArea],
  ['L8', 'Quitaúna', S.PaidArea],
  [
    'L8',
    'General Miguel Costa',
    S.FreeArea,
    'Terminal Metropolitano Luiz Bortolosso',
  ],
  ['L8', 'Carapicuíba', S.PaidArea],
  ['L8', 'Santa Terezinha', S.AvailableLocationUnknown],
  ['L8', 'Antônio João', S.PaidArea],
  ['L8', 'Barueri', S.PaidArea],
  ['L8', 'Jardim Belval', S.PaidArea],
  ['L8', 'Jardim Silveira', S.PaidArea],
  ['L8', 'Jandira', S.PaidArea],
  ['L8', 'Sagrado Coração', S.PaidArea],
  ['L8', 'Engenheiro Cardoso', S.PaidArea],
  ['L8', 'Itapevi', S.PaidArea],
  ['L8', 'Santa Rita', S.PaidArea],
  ['L8', 'Ambuitá', S.AvailableLocationUnknown],
  ['L8', 'Amador Bueno', S.PaidArea],

  // Linha 9 - Esmeralda
  ['L9', 'Osasco', S.PaidArea],
  ['L9', 'Presidente Altino', S.PaidArea],
  ['L9', 'Ceasa', S.PaidArea],
  ['L9', 'Villa Lobos-Jaguaré', S.PaidArea],
  ['L9', 'Cidade Universitária', S.PaidArea],
  ['L9', 'Pinheiros', S.PaidArea],
  ['L9', 'Hebraica-Rebouças', S.PaidArea],
  ['L9', 'Cidade Jardim', S.PaidArea],
  ['L9', 'Vila Olímpia', S.PaidArea],
  ['L9', 'Berrini', S.PaidArea],
  ['L9', 'Morumbi', S.PaidArea],
  ['L9', 'Granja Julieta', S.PaidArea],
  ['L9', 'João Dias', S.AvailableLocationUnknown],
  ['L9', 'Santo Amaro', S.PaidAndFreeAreas],
  ['L9', 'Socorro', S.PaidArea],
  ['L9', 'Jurubatuba', S.PaidArea],
  ['L9', 'Autódromo', S.PaidArea],
  ['L9', 'Primavera-Interlagos', S.PaidArea],
  ['L9', 'Grajaú', S.PaidArea],
  ['L9', 'Bruno Covas/Mendes-Vila Natal', S.AvailableLocationUnknown],
  ['L9', 'Varginha', S.AvailableLocationUnknown],

  // Linha 10 - Turquesa
  [
    'L10',
    'Palmeiras-Barra Funda',
    S.PaidAndFreeAreas,
    'No complexo ferroviário e no terminal',
  ],
  ['L10', 'Luz', S.PaidArea],
  [
    'L10',
    'Brás',
    S.PaidAndFreeAreas,
    'No complexo ferroviário e no terminal externo',
  ],
  ['L10', 'Juventus-Mooca', S.PaidArea],
  ['L10', 'Ipiranga', S.PaidArea],
  ['L10', 'Tamanduateí', S.PaidAndFreeAreas],
  ['L10', 'São Caetano do Sul', S.PaidArea],
  ['L10', 'Utinga', S.PaidArea],
  ['L10', 'Prefeito Saladino', S.PaidArea],
  ['L10', 'Prefeito Celso Daniel-Santo André', S.PaidArea],
  ['L10', 'Capuava', S.PaidArea],
  ['L10', 'Mauá', S.PaidArea],
  ['L10', 'Guapituba', S.PaidArea],
  ['L10', 'Ribeirão Pires', S.PaidArea],
  ['L10', 'Rio Grande da Serra', S.PaidArea],

  // Linha 11 - Coral
  [
    'L11',
    'Palmeiras-Barra Funda',
    S.PaidAndFreeAreas,
    'No complexo ferroviário e no terminal',
  ],
  ['L11', 'Luz', S.PaidArea],
  [
    'L11',
    'Brás',
    S.PaidAndFreeAreas,
    'No complexo ferroviário e no terminal externo',
  ],
  ['L11', 'Tatuapé', S.FreeArea, 'Terminal'],
  ['L11', 'Corinthians-Itaquera', S.FreeArea, 'Terminal'],
  ['L11', 'Dom Bosco', S.PaidArea],
  ['L11', 'José Bonifácio', S.PaidArea],
  ['L11', 'Guaianases', S.PaidArea],
  ['L11', 'Antonio Gianetti Neto', S.PaidArea],
  ['L11', 'Ferraz de Vasconcelos', S.PaidArea],
  ['L11', 'Poá', S.PaidArea],
  ['L11', 'Calmon Viana', S.PaidArea],
  ['L11', 'Suzano', S.PaidArea],
  ['L11', 'Jundiapeba', S.PaidArea],
  ['L11', 'Braz Cubas', S.AvailableLocationUnknown],
  ['L11', 'Mogi das Cruzes', S.PaidArea],
  ['L11', 'Estudantes', S.PaidArea],

  // Linha 12 - Safira
  [
    'L12',
    'Brás',
    S.PaidAndFreeAreas,
    'No complexo ferroviário e no terminal externo',
  ],
  ['L12', 'Tatuapé', S.FreeArea, 'Terminal'],
  ['L12', 'Engenheiro Goulart', S.PaidArea],
  ['L12', 'USP Leste', S.PaidArea],
  ['L12', 'Comendador Ermelino', S.PaidArea],
  ['L12', 'São Miguel Paulista', S.PaidArea],
  ['L12', 'Jardim Helena-Vila Mara', S.PaidArea],
  ['L12', 'Itaim Paulista', S.PaidArea],
  ['L12', 'Jardim Romano', S.PaidArea],
  ['L12', 'Engenheiro Manoel Feio', S.PaidArea],
  ['L12', 'Itaquaquecetuba', S.PaidArea],
  ['L12', 'Aracaré', S.PaidArea],
  ['L12', 'Calmon Viana', S.PaidArea],

  // Linha 13 - Jade
  ['L13', 'Engenheiro Goulart', S.PaidArea],
  ['L13', 'Guarulhos-Cecap', S.PaidArea],
  ['L13', 'Aeroporto-Guarulhos', S.PaidArea],

  // Linha 15 - Prata
  ['L15', 'Vila Prudente', S.PaidAndFreeAreas],
  ['L15', 'Oratório', S.PaidArea],
  ['L15', 'São Lucas', S.PaidArea],
  ['L15', 'Camilo Haddad', S.PaidArea],
  ['L15', 'Vila Tolstói', S.PaidArea],
  ['L15', 'Vila União', S.PaidArea],
  ['L15', 'Jardim Planalto', S.PaidArea],
  ['L15', 'Sapopemba', S.PaidArea],
  ['L15', 'Fazenda da Juta', S.PaidArea],
  ['L15', 'São Mateus', S.PaidArea],
  ['L15', 'Jardim Colonial', S.PaidArea],

  // Linha 17 - Ouro
  ['L17', 'Washington Luís', S.AvailableLocationUnknown],
  ['L17', 'Aeroporto de Congonhas', S.AvailableLocationUnknown],
  ['L17', 'Brooklin Paulista', S.AvailableLocationUnknown],
  ['L17', 'Vereador José Diniz', S.AvailableLocationUnknown],
  ['L17', 'Campo Belo', S.AvailableLocationUnknown],
  ['L17', 'Vila Cordeiro', S.AvailableLocationUnknown],
  ['L17', 'Chucri Zaidan', S.AvailableLocationUnknown],
  ['L17', 'Morumbi', S.AvailableLocationUnknown],
] as const satisfies readonly StationBathroomTuple[];

export const STATION_BATHROOM_RECORDS: readonly StationBathroomRecord[] =
  STATION_BATHROOM_DATA.map(([lineCode, stationName, status, note]) => ({
    lineCode,
    stationName,
    status,
    ...(note ? { note } : {}),
  }));

export function findStationBathroomRecord(
  stationName: string,
  lineCode: string | number,
): StationBathroomRecord | undefined {
  const normalizedLineCode = normalizeLineCode(lineCode);
  const staticStation = getStaticRailStationsByLine(normalizedLineCode)?.find(
    (station) => stationMatches(stationName, station),
  );
  const normalizedStationName = hardNormalizeString(
    staticStation?.name ?? stationName,
  );

  return STATION_BATHROOM_RECORDS.find(
    (record) =>
      record.lineCode === normalizedLineCode &&
      hardNormalizeString(record.stationName) === normalizedStationName,
  );
}

export function aggregateStationBathroomInfo(
  records: readonly StationBathroomRecord[],
): ResolvedStationBathroomInfo | undefined {
  const knownRecords = records.filter(
    (record) => record.status !== StationBathroomStatus.Unknown,
  );

  if (knownRecords.length === 0) {
    return undefined;
  }

  const notes = Array.from(
    new Set(
      knownRecords.flatMap((record) => (record.note ? [record.note] : [])),
    ),
  );
  const hasPaidArea = knownRecords.some(
    (record) =>
      record.status === StationBathroomStatus.PaidArea ||
      record.status === StationBathroomStatus.PaidAndFreeAreas,
  );
  const hasFreeArea = knownRecords.some(
    (record) =>
      record.status === StationBathroomStatus.FreeArea ||
      record.status === StationBathroomStatus.PaidAndFreeAreas,
  );

  if (hasPaidArea || hasFreeArea) {
    return {
      status:
        hasPaidArea && hasFreeArea
          ? StationBathroomStatus.PaidAndFreeAreas
          : hasPaidArea
            ? StationBathroomStatus.PaidArea
            : StationBathroomStatus.FreeArea,
      notes,
    };
  }

  if (
    knownRecords.some(
      (record) =>
        record.status === StationBathroomStatus.AvailableLocationUnknown,
    )
  ) {
    return {
      status: StationBathroomStatus.AvailableLocationUnknown,
      notes,
    };
  }

  return {
    status: StationBathroomStatus.Unavailable,
    notes,
  };
}

export function resolveStationBathroomInfo(
  stationName: string,
  lineCodes: readonly (string | number)[],
): ResolvedStationBathroomInfo | undefined {
  const records = lineCodes.flatMap((lineCode) => {
    const record = findStationBathroomRecord(stationName, lineCode);
    return record ? [record] : [];
  });

  return aggregateStationBathroomInfo(records);
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
