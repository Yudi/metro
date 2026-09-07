import type { BusStopGraphQL } from './bus-data.types';

// Mock Bus Stops

/** Regular bus stop in São Paulo */
export const PINHEIROS_BUS_STOP: BusStopGraphQL = {
  id: 'stop-pinheiros-1',
  stopId: '340015325',
  name: 'Av. Brigadeiro Faria Lima, 1234',
  description: 'Próximo à estação Faria Lima',
  latitude: -23.5669,
  longitude: -46.6918,
  isSubwayStation: false,
  agencies: ['SPTRANS'],
  routeShortNames: ['477A-10', '775A-10', '177H-10'],
};

/** Bus stop with many routes */
export const CONSOLACAO_BUS_STOP: BusStopGraphQL = {
  id: 'stop-consolacao-1',
  stopId: '340012345',
  name: 'Av. Paulista, 1000',
  description: 'Em frente ao MASP',
  latitude: -23.5614,
  longitude: -46.656,
  isSubwayStation: false,
  agencies: ['SPTRANS'],
  routeShortNames: ['875A-10', '875I-10', '875P-10', '6291-10', '7181-10'],
};

/** Shared physical stop: SPTrans remains the canonical realtime identity. */
export const SHARED_SPTRANS_ARTESP_BUS_STOP: BusStopGraphQL = {
  id: '340015325',
  stopId: '340015325',
  name: 'Av. Brigadeiro Faria Lima, 1234',
  description: 'Ponto compartilhado com a Artesp',
  latitude: -23.5669,
  longitude: -46.6918,
  isSubwayStation: false,
  agencies: ['SPTRANS', 'ARTESP'],
  routeShortNames: ['477A-10', '001'],
  sourceAgency: 'SPTRANS',
  sourceId: '340015325',
  platformCode: 'B',
  mergedStopIds: ['340015325', 'artesp:42'],
};

/** Standalone Artesp stop: schedules are available, but realtime is not. */
export const ARTESP_ONLY_BUS_STOP: BusStopGraphQL = {
  id: 'artesp:terminal-regional-42',
  stopId: 'artesp:42',
  name: 'Terminal Regional',
  description: 'Plataforma 1',
  latitude: -23.55,
  longitude: -46.63,
  isSubwayStation: false,
  agencies: ['ARTESP'],
  routeShortNames: ['001', '02Verde'],
  sourceAgency: 'ARTESP',
  sourceId: '42',
  platformCode: '1',
  mergedStopIds: ['artesp:42'],
};

/** Subway station that is also a bus stop */
export const SE_SUBWAY_STATION: BusStopGraphQL = {
  id: 'station-se-1',
  stopId: '99001',
  name: 'Sé',
  description:
    'Estação Sé do Metrô, ponto de conexão das linhas 1-Azul e 3-Vermelha',
  latitude: -23.5503,
  longitude: -46.6331,
  isSubwayStation: true,
  agencies: ['METRO'],
  routeShortNames: ['L1', 'L3'],
};

/** Bus stop with no routes (edge case) */
export const EMPTY_BUS_STOP: BusStopGraphQL = {
  id: 'stop-empty-1',
  stopId: '340099999',
  name: 'Rua Desconhecida, s/n',
  description: undefined,
  latitude: -23.55,
  longitude: -46.65,
  isSubwayStation: false,
  agencies: [],
  routeShortNames: [],
};
