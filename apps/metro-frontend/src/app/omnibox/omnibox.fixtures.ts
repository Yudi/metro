import type {
  NearbyGraphQLResponse,
  NearbyStopsResponse,
  SearchGraphQLResponse,
  SearchGraphQLResult,
  TypesenseSearchResponse,
} from '../search/typesense-search.types';

/** Raw server order is intentional: text search preserves Typesense ranking. */
export const OMNIBOX_SEARCH_RESULTS: SearchGraphQLResult[] = [
  {
    __typename: 'SearchBusRoute',
    route_id: '477A-10',
    route_short_name: '477A',
    route_long_name: 'Sacomã – Pinheiros',
    route_color: '0066CC',
    route_text_color: 'FFFFFF',
    sourceAgency: 'SPTRANS',
    sourceId: '477A-10',
    supportsRealtime: true,
    fares: [{ price: 5, currency: 'BRL' }],
  },
  {
    __typename: 'SearchBusStop',
    stop_id: '340015325',
    stop_name: 'Av. Paulista, 1000',
    stop_desc: 'Em frente ao MASP',
    stop_lat: -23.5614,
    stop_lon: -46.656,
    sourceAgency: 'SPTRANS',
    sourceId: '340015325',
    routes: [
      {
        id: 'sptrans:477A-10',
        route_id: '477A-10',
        route_short_name: '477A',
        route_long_name: 'Sacomã – Pinheiros',
        route_color: '0066CC',
        route_text_color: 'FFFFFF',
        sourceAgency: 'SPTRANS',
        sourceId: '477A-10',
        supportsRealtime: true,
        fares: [{ price: 5, currency: 'BRL' }],
      },
    ],
  },
  {
    __typename: 'SearchRailStation',
    station_code: 'CONS',
    station_name: 'Consolação',
    station_aliases: ['Verde'],
    railLatitude: -23.5571,
    railLongitude: -46.6606,
  },
  {
    __typename: 'SearchBikeStation',
    station_id: 'bike-35',
    station_name: 'Estação 35 · Jardim Europa',
    bikeLatitude: -23.5731,
    bikeLongitude: -46.6822,
  },
];

export const OMNIBOX_GRAPHQL_SEARCH_RESPONSE: SearchGraphQLResponse = {
  data: { search: OMNIBOX_SEARCH_RESULTS },
};

/** Converted shape returned by TypesenseSearchService after its mapper runs. */
export function createOmniboxSearchResponse(
  query = 'paulista',
): TypesenseSearchResponse {
  return {
    success: true,
    query,
    total: 4,
    results: [
      {
        type: 'route',
        document: {
          id: '477A-10',
          route_id: '477A-10',
          route_short_name: '477A',
          route_long_name: 'Sacomã – Pinheiros',
          route_color: '0066CC',
          route_text_color: 'FFFFFF',
          source: 'gtfs',
          sourceAgency: 'SPTRANS',
          sourceId: '477A-10',
          supportsRealtime: true,
          fares: [{ price: 5, currency: 'BRL' }],
        },
      },
      {
        type: 'stop',
        document: {
          id: '340015325',
          stop_id: '340015325',
          stop_name: 'Av. Paulista, 1000',
          stop_desc: 'Em frente ao MASP',
          stop_lat: -23.5614,
          stop_lon: -46.656,
          is_subway_station: false,
          source: 'gtfs',
          sourceAgency: 'SPTRANS',
          sourceId: '340015325',
          routes: [
            {
              id: 'sptrans:477A-10',
              route_id: '477A-10',
              route_short_name: '477A',
              route_long_name: 'Sacomã – Pinheiros',
              route_color: '0066CC',
              route_text_color: 'FFFFFF',
              sourceAgency: 'SPTRANS',
              sourceId: '477A-10',
              supportsRealtime: true,
              fares: [{ price: 5, currency: 'BRL' }],
            },
          ],
        },
      },
      {
        type: 'stop',
        document: {
          id: 'CONS',
          stop_id: 'CONS',
          stop_name: 'Consolação',
          stop_desc: 'GeoSampa - Verde',
          stop_lat: -23.5571,
          stop_lon: -46.6606,
          is_subway_station: true,
          source: 'gpkg',
        },
      },
      {
        type: 'stop',
        document: {
          id: 'bike-35',
          stop_id: 'bike-35',
          stop_name: 'Estação 35 · Jardim Europa',
          stop_lat: -23.5731,
          stop_lon: -46.6822,
          source: 'bike',
        },
      },
    ],
  };
}

/** Nearby responses follow the backend's nearest-first order. */
export const OMNIBOX_NEARBY_RESULTS: SearchGraphQLResult[] = [
  {
    __typename: 'SearchBusStop',
    stop_id: '340015325',
    stop_name: 'Av. Paulista, 1000',
    stop_desc: 'Em frente ao MASP',
    stop_lat: -23.5614,
    stop_lon: -46.656,
  },
  {
    __typename: 'SearchRailStation',
    station_code: 'CONS',
    station_name: 'Consolação',
    station_aliases: ['Verde'],
    railLatitude: -23.5571,
    railLongitude: -46.6606,
  },
];

export const OMNIBOX_GRAPHQL_NEARBY_RESPONSE: NearbyGraphQLResponse = {
  data: { nearbyStops: OMNIBOX_NEARBY_RESULTS },
};

export const OMNIBOX_NEARBY_RESPONSE: NearbyStopsResponse = {
  success: true,
  center: { lat: -23.56, lon: -46.66 },
  radius: 1000,
  stops: [
    {
      id: '340015325',
      stop_id: '340015325',
      stop_name: 'Av. Paulista, 1000',
      stop_desc: 'Em frente ao MASP',
      stop_lat: -23.5614,
      stop_lon: -46.656,
      is_subway_station: false,
      source: 'gtfs',
    },
    {
      id: 'CONS',
      stop_id: 'CONS',
      stop_name: 'Consolação',
      stop_desc: 'GeoSampa - Verde',
      stop_lat: -23.5571,
      stop_lon: -46.6606,
      is_subway_station: true,
      source: 'gpkg',
    },
  ],
};
