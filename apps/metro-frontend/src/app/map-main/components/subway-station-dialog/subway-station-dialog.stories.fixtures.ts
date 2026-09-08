import { signal } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { StationNameService } from '../../geography/station-name.service';
import {
  LoggerService,
  RailGraphqlService,
  API_BASE_URL,
} from '@metro/shared/api';
import {
  SPECIAL_RAIL_LINE_CODES,
  SpecialRailLineStatus,
} from '@metro/shared/utils';
import type { BusStopGraphQL } from '../../geography/geography-graphql.service';
import {
  createMockRailGraphqlService,
  type MockRailServiceOptions,
} from '@metro/storybook-mocks';
import {
  NextTrainWebsocketService,
  type NextTrainArrival,
  type StationTrainData,
} from '../../../next-train/next-train-websocket.service';

export const PARAISO: BusStopGraphQL = {
  id: 'paraiso-1',
  stopId: '99999',
  name: 'Paraíso',
  description:
    'Estação Paraíso do Metrô, ligação entre L1 (Azul) e L2 (Verde).',
  latitude: -23.578,
  longitude: -46.635,
  isSubwayStation: true,
  agencies: ['METRO'],
  routeShortNames: ['L1', 'L2'],
};

export const JABAQUARA: BusStopGraphQL = {
  ...PARAISO,
  id: 'jabaquara-1',
  stopId: 'jabaquara-1',
  name: 'Jabaquara-Comitê Paralímpico Brasileiro',
  description: 'Estação terminal da Linha 1 - Azul.',
  routeShortNames: ['L1'],
};

export const SAO_JUDAS: BusStopGraphQL = {
  ...PARAISO,
  id: 'sao-judas-1',
  stopId: 'sao-judas-1',
  name: 'São Judas',
  description: 'Estação São Judas da Linha 1 - Azul.',
  routeShortNames: ['L1'],
};

export const SANTA_CRUZ: BusStopGraphQL = {
  ...PARAISO,
  id: 'santa-cruz-1',
  stopId: 'santa-cruz-1',
  name: 'Santa Cruz',
  description: 'Integração entre as linhas 1 - Azul e 5 - Lilás.',
  routeShortNames: ['L1', 'L5'],
};

export const SANTANA: BusStopGraphQL = {
  ...PARAISO,
  id: 'santana-1',
  stopId: 'santana-1',
  name: 'Santana',
  description: 'Estação Santana da Linha 1 - Azul.',
  routeShortNames: ['L1'],
};

export const VILA_DAS_BELEZAS: BusStopGraphQL = {
  ...PARAISO,
  id: 'vila-das-belezas-1',
  stopId: 'vila-das-belezas-1',
  name: 'Vila das Belezas',
  description: 'Estação Vila das Belezas da Linha 5 - Lilás.',
  routeShortNames: ['L5'],
};

export const AEROPORTO_GUARULHOS: BusStopGraphQL = {
  ...PARAISO,
  id: 'aeroporto-guarulhos-1',
  stopId: 'AGU',
  name: 'Aeroporto-Guarulhos',
  description:
    'Estação Aeroporto-Guarulhos da Linha 13 - Jade, com acesso ao Aeromóvel GRU.',
  agencies: ['CPTM'],
  routeShortNames: ['Jade'],
};

export const AEROMOVEL_GRU_OPEN: SpecialRailLineStatus = {
  code: SPECIAL_RAIL_LINE_CODES.AEROMOVEL_GRU,
  colorName: 'Azul',
  colorHex: '#186dbf',
  line: 'Aeromóvel GRU',
  statusCode: 'OperacaoNormal',
  statusLabel: 'Aberto',
  statusColor: 'verde',
  nextDepartures: [],
  issues: [],
};

export const AEROMOVEL_GRU_CLOSED: SpecialRailLineStatus = {
  ...AEROMOVEL_GRU_OPEN,
  statusCode: 'OperacaoEncerrada',
  statusLabel: 'Operação Encerrada',
  statusColor: 'cinza',
};

export const PINHEIROS: BusStopGraphQL = {
  id: 'pinheiros-1',
  stopId: '88888',
  name: 'Pinheiros',
  description: 'Estação Pinheiros da Linha 9 - Esmeralda (ViaMobilidade).',
  latitude: -23.567,
  longitude: -46.702,
  isSubwayStation: true,
  agencies: ['VIAMOBILIDADE'],
  routeShortNames: ['L9'],
};

export const PINHEIROS_TRAINS: NextTrainArrival[] = [
  {
    destinationCode: 'VAG',
    destinationName: 'Varginha',
    trainCurrentStationName: 'Villa Lobos–Jaguaré',
    arrivalTime: '21:04',
    isAtPlatform: false,
    isTrainStopped: false,
  },
  {
    destinationCode: 'OSA',
    destinationName: 'Osasco',
    trainCurrentStationName: 'Pinheiros',
    arrivalTime: '21:00',
    isAtPlatform: true,
    isTrainStopped: true,
  },
];

export const OSASCO: BusStopGraphQL = {
  id: 'osasco-1',
  stopId: '77777',
  name: 'Osasco',
  description:
    'Estação Osasco, servida pela Linha 8 - Diamante e Linha 9 - Esmeralda.',
  latitude: -23.532,
  longitude: -46.791,
  isSubwayStation: true,
  agencies: ['VIAMOBILIDADE'],
  routeShortNames: ['L8', 'L9'],
};

export const OSASCO_L8_TRAINS: NextTrainArrival[] = [
  {
    destinationCode: 'JPR',
    destinationName: 'Júlio Prestes',
    trainCurrentStationName: 'Comandante Sampaio',
    arrivalTime: '14:35',
    isAtPlatform: false,
    isTrainStopped: false,
  },
  {
    destinationCode: 'IPV',
    destinationName: 'Itapevi',
    trainCurrentStationName: 'Presidente Altino',
    arrivalTime: '14:38',
    isAtPlatform: false,
    isTrainStopped: true,
  },
];

export const OSASCO_L9_TRAINS: NextTrainArrival[] = [
  {
    destinationCode: 'VAG',
    destinationName: 'Varginha',
    trainCurrentStationName: 'Presidente Altino',
    arrivalTime: '14:40',
    isAtPlatform: false,
    isTrainStopped: false,
  },
];

type SubscriptionKey = `${string}:${string}`;

interface MockNextTrainEntry {
  lineCode: string;
  stationCode: string;
  trains: NextTrainArrival[];
}

function createMockNextTrainService(
  entries: MockNextTrainEntry[],
): Partial<NextTrainWebsocketService> {
  const dataMap = new Map<SubscriptionKey, StationTrainData>();

  for (const entry of entries) {
    const key: SubscriptionKey = `${entry.lineCode}:${entry.stationCode}`;
    dataMap.set(key, {
      trains: entry.trains,
      hasError: false,
      dataReceived: true,
      processing: false,
      operationClosed: false,
      outOfSchedule: false,
    });
  }

  return {
    connected: signal(true),
    lastUpdate: signal(Date.now()),
    stationData: signal(dataMap),
    subscribe: () => () => undefined,
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    unsubscribe: () => {},
    getTrains: (lineCode: 'L8' | 'L9', stationCode: string) => {
      const key: SubscriptionKey = `${lineCode}:${stationCode}`;
      return dataMap.get(key)?.trains ?? [];
    },
  };
}

export function createSubwayStationDialogProviders(
  stop: BusStopGraphQL,
  serviceOpts: MockRailServiceOptions,
  nextTrainData: MockNextTrainEntry[] = [],
) {
  return [
    {
      provide: MatDialogRef,
      useValue: { close: () => console.log('dialog closed') },
    },
    {
      provide: MAT_DIALOG_DATA,
      useValue: { stop },
    },
    {
      provide: StationNameService,
      useValue: {
        normalizeStationName: (name: string) => name,
        formatStationName: (name: string) => name,
      },
    },
    {
      provide: LoggerService,
      useValue: {
        debug: (...logArgs: unknown[]) => console.debug('[story] ', ...logArgs),
        error: (...logArgs: unknown[]) => console.error('[story] ', ...logArgs),
      },
    },
    {
      provide: API_BASE_URL,
      useValue: 'http://localhost',
    },
    {
      provide: RailGraphqlService,
      useValue: createMockRailGraphqlService(serviceOpts),
    },
    {
      provide: NextTrainWebsocketService,
      useValue: createMockNextTrainService(nextTrainData),
    },
  ];
}
