import type {
  OperationalNotice,
  BusNoticesResult,
} from '../map-main/components/bus-information/bus-information.service';
import type {
  TypesenseRoute,
  TypesenseSearchResult,
} from '../search/typesense-search.service';
import type { PublishedRouteInformation } from '@metro/shared/bus-itinerary-contracts';
import type { ItineraryPattern, RouteItinerary } from './itineraries.service';

function scheduledTimes(
  start: number,
  end: number,
  interval: number,
): string[] {
  const minutes = Array.from(
    { length: Math.floor((end - start) / interval) + 1 },
    (_, index) => start + index * interval,
  );
  if (minutes[minutes.length - 1] !== end) minutes.push(end);
  return minutes.map(
    (time) =>
      `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}:00`,
  );
}

function stops(
  prefix: string,
  names: readonly string[],
  latitude: number,
  longitude: number,
): ItineraryPattern['stops'] {
  return names.map((name, index) => ({
    id: `${prefix}-${index + 1}`,
    name,
    sequence: index + 1,
    latitude: latitude - index * 0.008,
    longitude: longitude - index * 0.006,
  }));
}

function frequency(
  startTime: string,
  endTime: string,
  headwaySeconds: number,
): ItineraryPattern['intervals'][number] {
  return { startTime, endTime, headwaySeconds, exactTimes: false };
}

function pattern(
  id: string,
  directionId: number,
  headsign: string,
  stopNames: readonly string[],
  departures: string[],
  intervals: ItineraryPattern['intervals'],
  durationMinutes: number,
): ItineraryPattern {
  return {
    id,
    directionId,
    headsign,
    stops: stops(id, stopNames, -23.505, -46.625),
    departures,
    intervals,
    durationMinutes,
  };
}

export const SPTRANS_ROUTE: TypesenseRoute = {
  id: 'sptrans:477A-10',
  route_id: '477A-10',
  agency_id: 'sptrans',
  route_short_name: '477A-10',
  route_long_name: 'Sacomã – Pinheiros',
  route_type: 3,
  route_color: '0066CC',
  route_text_color: 'FFFFFF',
  source: 'gtfs',
  sourceAgency: 'SPTRANS',
  sourceId: '477A-10',
  supportsRealtime: true,
  fares: [{ price: 5, currency: 'BRL' }],
};

export const ARTESP_ROUTE: TypesenseRoute = {
  id: 'artesp:001',
  route_id: 'artesp:001',
  agency_id: 'artesp',
  route_short_name: '001',
  route_long_name: 'Terminal Regional – Centro',
  route_type: 3,
  route_color: 'C90C0F',
  route_text_color: 'FFFFFF',
  source: 'gtfs',
  sourceAgency: 'ARTESP',
  sourceId: '001',
  supportsRealtime: false,
  fares: [{ price: 5.5, currency: 'BRL' }],
};

export const SPTRANS_ITINERARY: RouteItinerary = {
  status: 'AVAILABLE',
  serviceDate: '2026-09-07',
  operatorName: 'SPTrans (dados ilustrativos)',
  route: {
    routeId: SPTRANS_ROUTE.route_id,
    shortName: SPTRANS_ROUTE.route_short_name,
    longName: SPTRANS_ROUTE.route_long_name,
    sourceAgency: 'SPTRANS',
    color: '0066CC',
    textColor: 'FFFFFF',
    fares: SPTRANS_ROUTE.fares ?? [],
  },
  patterns: [
    pattern(
      '477a-ida',
      0,
      'Pinheiros',
      [
        'Sacomã',
        'Av. Cruzeiro do Sul',
        'Av. Paulista',
        'Consolação',
        'Av. Rebouças',
        'Terminal Pinheiros',
      ],
      ['25:10:00'],
      [
        frequency('04:30:00', '08:30:00', 600),
        frequency('08:30:00', '18:30:00', 900),
        frequency('18:30:00', '23:30:00', 1200),
      ],
      55,
    ),
    pattern(
      '477a-volta',
      1,
      'Sacomã',
      [
        'Terminal Pinheiros',
        'Av. Rebouças',
        'Consolação',
        'Av. Paulista',
        'Av. Cruzeiro do Sul',
        'Sacomã',
      ],
      ['05:00:00', '25:40:00'],
      [
        frequency('05:00:00', '09:00:00', 720),
        frequency('09:00:00', '19:00:00', 900),
        frequency('19:00:00', '23:00:00', 1200),
      ],
      58,
    ),
  ],
};

export const ARTESP_ITINERARY: RouteItinerary = {
  status: 'AVAILABLE',
  serviceDate: '2026-09-07',
  operatorName: 'Operadora regional (dados ilustrativos)',
  route: {
    routeId: ARTESP_ROUTE.route_id,
    shortName: ARTESP_ROUTE.route_short_name,
    longName: ARTESP_ROUTE.route_long_name,
    sourceAgency: 'ARTESP',
    color: 'C90C0F',
    textColor: 'FFFFFF',
    fares: ARTESP_ROUTE.fares ?? [],
  },
  patterns: [
    pattern(
      '001-ida',
      0,
      'Centro',
      ['Terminal Regional', 'Jardim das Flores', 'Av. Central', 'Centro'],
      ['05:20:00', '07:00:00', '09:40:00', '12:15:00', '18:40:00'],
      [],
      75,
    ),
    pattern(
      '001-volta',
      1,
      'Terminal Regional',
      ['Centro', 'Av. Central', 'Jardim das Flores', 'Terminal Regional'],
      ['06:10:00', '08:05:00', '10:45:00', '14:30:00', '19:30:00'],
      [],
      75,
    ),
  ],
};

export const UNAVAILABLE_ITINERARY: RouteItinerary = {
  status: 'UNAVAILABLE',
  serviceDate: '2026-09-07',
  operatorName: null,
  route: null,
  patterns: [],
};

export const SPTRANS_PUBLISHED: PublishedRouteInformation = {
  status: 'AVAILABLE',
  routeCode: SPTRANS_ROUTE.route_id,
  lastUpdated: '2026-09-07T12:00:00-03:00',
  operatorName: 'SPTrans (dados ilustrativos)',
  consortiumName: 'Consórcio Exemplo',
  days: [
    {
      kind: 'weekday',
      directions: [
        {
          id: '477a-ida',
          headsign: 'Pinheiros',
          departures: scheduledTimes(270, 1510, 20),
          startTime: '04:30:00',
          endTime: '25:10:00',
          streets: [
            {
              name: 'Av. Paulista',
              number: '1000',
              notices: [
                'Exemplo: embarque temporariamente transferido para a próxima quadra durante o evento. Confira o período no aviso da linha.',
              ],
            },
            { name: 'Av. Rebouças', number: '2500' },
          ],
          travelTimes: [
            { period: 'morning', minutes: 55 },
            { period: 'interpeak', minutes: 48 },
            { period: 'afternoon', minutes: 62 },
          ],
        },
        {
          id: '477a-volta',
          headsign: 'Sacomã',
          departures: scheduledTimes(300, 1540, 20),
          startTime: '05:00:00',
          endTime: '25:40:00',
          streets: [
            { name: 'Av. Rebouças', number: '2500' },
            { name: 'Av. Cruzeiro do Sul', number: '3000' },
          ],
          travelTimes: [
            { period: 'morning', minutes: 58 },
            { period: 'interpeak', minutes: 50 },
            { period: 'afternoon', minutes: 65 },
          ],
        },
      ],
    },
    {
      kind: 'saturday',
      directions: [
        {
          id: '477a-ida',
          headsign: 'Pinheiros',
          departures: scheduledTimes(330, 1470, 30),
          startTime: '05:30:00',
          endTime: '24:30:00',
          streets: [],
          travelTimes: [{ period: 'interpeak', minutes: 55 }],
        },
        {
          id: '477a-volta',
          headsign: 'Sacomã',
          departures: scheduledTimes(360, 1490, 30),
          startTime: '06:00:00',
          endTime: '24:50:00',
          streets: [],
          travelTimes: [{ period: 'interpeak', minutes: 58 }],
        },
      ],
    },
    {
      kind: 'sunday',
      directions: [
        {
          id: '477a-ida',
          headsign: 'Pinheiros',
          departures: scheduledTimes(360, 1410, 30),
          startTime: '06:00:00',
          endTime: '23:30:00',
          streets: [],
          travelTimes: [{ period: 'interpeak', minutes: 60 }],
        },
        {
          id: '477a-volta',
          headsign: 'Sacomã',
          departures: scheduledTimes(390, 1430, 30),
          startTime: '06:30:00',
          endTime: '23:50:00',
          streets: [],
          travelTimes: [{ period: 'interpeak', minutes: 63 }],
        },
      ],
    },
  ],
};

export const UNAVAILABLE_PUBLISHED: PublishedRouteInformation = {
  status: 'UNAVAILABLE',
  routeCode: SPTRANS_ROUTE.route_id,
  lastUpdated: null,
  operatorName: null,
  consortiumName: null,
  days: [],
};

export const SPTRANS_SEARCH_RESULTS: TypesenseSearchResult[] = [
  { type: 'route', document: SPTRANS_ROUTE },
];

export const ARTESP_SEARCH_RESULTS: TypesenseSearchResult[] = [
  { type: 'route', document: ARTESP_ROUTE },
];

export const SPTRANS_NOTICES: BusNoticesResult = {
  status: 'AVAILABLE',
  lastUpdated: '2026-09-07T12:00:00-03:00',
  notices: [
    {
      sourceId: 'story-477a-notice',
      sourceUrl:
        'https://www.sptrans.com.br/informativos/oeste/desvios-de-itinerarios-na-regiao-da-av-paulista/71116/',
      title: 'Exemplo: desvio no corredor Paulista',
      description:
        '07/09/2026, das 9h às 20h.\nMotivo: evento ilustrativo na via.\n477A-10\nIda: embarque provisório na Av. Rebouças durante a interdição.\nVolta: embarque provisório na Rua Augusta.',
      routes: ['477A-10'],
      periodText: '07/09/2026, das 9h às 20h.',
      listedDate: '7 de setembro de 2026',
      listing: 'RECENT',
    } satisfies OperationalNotice,
  ],
};

export const NO_NOTICES: BusNoticesResult = {
  status: 'AVAILABLE',
  lastUpdated: null,
  notices: [],
};
