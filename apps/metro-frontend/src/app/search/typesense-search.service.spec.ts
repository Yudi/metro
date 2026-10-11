import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { LoggerService } from '@metro/shared/api';
import {
  TYPESENSE_NEARBY_STOPS_QUERY,
  TYPESENSE_SEARCH_QUERY,
} from './typesense-search.queries';
import { TypesenseSearchService } from './typesense-search.service';

describe('TypesenseSearchService', () => {
  let service: TypesenseSearchService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LoggerService, useValue: { error: jest.fn() } },
      ],
    });
    service = TestBed.inject(TypesenseSearchService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    jest.useRealTimers();
  });

  it('passes the selected search types and preserves the server relevance order', () => {
    const received = jest.fn();
    service.search(' 477A ', ['busRoute', 'railStation']).subscribe(received);

    const request = http.expectOne('/api/graphql');
    expect(request.request.body.variables.input).toEqual({
      query: '477A',
      includeBusRoutes: true,
      includeBusStops: false,
      includeRailLines: false,
      includeRailStations: true,
      includeBikeStations: false,
    });
    request.flush({
      data: {
        search: [
          {
            __typename: 'SearchBusRoute',
            route_id: '477A',
            route_short_name: '477A',
            route_long_name: 'Terminal Interlagos',
            route_color: 'FFFFFF',
            route_text_color: '000000',
          },
          {
            __typename: 'SearchRailStation',
            station_code: 'station-1',
            station_name: 'Interlagos',
            station_aliases: [],
            railLatitude: -23.7,
            railLongitude: -46.7,
          },
        ],
      },
    });

    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        query: ' 477A ',
        results: [
          expect.objectContaining({
            document: expect.objectContaining({ id: '477A' }),
          }),
          expect.objectContaining({
            document: expect.objectContaining({ id: 'station-1' }),
          }),
        ],
      }),
    );
  });

  it('omits nested stop routes from search and nearby GraphQL selections', () => {
    expect(TYPESENSE_SEARCH_QUERY).not.toContain('routes {');
    expect(TYPESENSE_NEARBY_STOPS_QUERY).not.toContain('routes {');
  });

  it('returns a failed search result for GraphQL errors with HTTP 200', () => {
    const received = jest.fn();
    service.search('Terminal').subscribe(received);
    http.expectOne('/api/graphql').flush({
      data: { search: [] },
      errors: [{ message: 'Typesense unavailable' }],
    });

    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        results: [],
        message: 'Search failed',
      }),
    );

    const retried = jest.fn();
    service.search('Terminal').subscribe(retried);
    http.expectOne('/api/graphql').flush({ data: { search: [] } });
    expect(retried).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, results: [] }),
    );
  });

  it('caches successful results by trimmed query and canonical type set', () => {
    const first = jest.fn();
    service.search(' 477A ', ['railStation', 'busRoute']).subscribe(first);
    http.expectOne('/api/graphql').flush({
      data: {
        search: [
          {
            __typename: 'SearchBusRoute',
            route_id: '477A',
            route_short_name: '477A',
            route_long_name: 'Terminal Interlagos',
          },
        ],
      },
    });

    const cached = jest.fn();
    service.search('477A', ['busRoute', 'railStation']).subscribe(cached);
    expect(cached).toHaveBeenCalledWith(
      expect.objectContaining({ query: '477A', total: 1 }),
    );
    http.expectNone('/api/graphql');

    const differentTypes = jest.fn();
    service.search('477A', ['busRoute']).subscribe(differentTypes);
    http.expectOne('/api/graphql').flush({ data: { search: [] } });
    expect(differentTypes).toHaveBeenCalledWith(
      expect.objectContaining({ query: '477A', total: 0 }),
    );
  });

  it('shares simultaneous searches while preserving each caller query', () => {
    const first = jest.fn();
    const second = jest.fn();
    service.search(' Terminal ', ['busStop']).subscribe(first);
    service.search('Terminal', ['busStop']).subscribe(second);

    http.expectOne('/api/graphql').flush({ data: { search: [] } });

    expect(first).toHaveBeenCalledWith(
      expect.objectContaining({ query: ' Terminal ' }),
    );
    expect(second).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'Terminal' }),
    );
  });

  it('maps stop results when nested routes are not returned', () => {
    const received = jest.fn();
    service.search('Central').subscribe(received);
    http.expectOne('/api/graphql').flush({
      data: {
        search: [
          {
            __typename: 'SearchBusStop',
            stop_id: 'stop-1',
            stop_name: 'Central',
            stop_lat: -23.5,
            stop_lon: -46.6,
          },
        ],
      },
    });

    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        results: [
          expect.objectContaining({
            document: expect.objectContaining({
              routes: [],
            }),
          }),
        ],
      }),
    );
  });

  it('expires cached results after the TTL', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-10T00:00:00.000Z'));

    service.search('Terminal').subscribe();
    http.expectOne('/api/graphql').flush({ data: { search: [] } });

    jest.advanceTimersByTime(30_001);
    service.search('Terminal').subscribe();
    http.expectOne('/api/graphql').flush({ data: { search: [] } });
  });

  it('bounds the cache and evicts the least recently used search', () => {
    for (let index = 0; index < 101; index++) {
      service.search(`query-${index}`, []).subscribe();
      http.expectOne('/api/graphql').flush({ data: { search: [] } });
    }

    service.search('query-0', []).subscribe();
    http.expectOne('/api/graphql').flush({ data: { search: [] } });

    service.search('query-100', []).subscribe();
    http.expectNone('/api/graphql');
  });

  it('cancels an in-flight request when its last subscriber unsubscribes', () => {
    const subscription = service.search('cancel me').subscribe();
    subscription.unsubscribe();

    const cancelledRequests = http.match('/api/graphql');
    expect(cancelledRequests).toHaveLength(1);
    expect(cancelledRequests[0].cancelled).toBe(true);

    service.search('cancel me').subscribe();
    http.expectOne('/api/graphql').flush({ data: { search: [] } });
  });

  it('clears cached searches after successful reindexing', () => {
    service.search('Terminal').subscribe();
    http.expectOne('/api/graphql').flush({ data: { search: [] } });

    service.reindexData().subscribe();
    http.expectOne('/api/graphql').flush({ data: { reindexSearch: true } });

    service.search('Terminal').subscribe();
    http.expectOne('/api/graphql').flush({ data: { search: [] } });
  });

  it('keeps a valid empty search distinct from a GraphQL failure', () => {
    const received = jest.fn();
    service.search('No matching stop').subscribe(received);
    http.expectOne('/api/graphql').flush({ data: { search: [] } });

    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        results: [],
        total: 0,
      }),
    );
  });

  it('preserves server distance order for nearby stops and stations', () => {
    const received = jest.fn();
    service.searchNearbyStops(-23.55, -46.63, 750).subscribe(received);
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.variables.input).toEqual({
      latitude: -23.55,
      longitude: -46.63,
      radiusMeters: 750,
    });
    request.flush({
      data: {
        nearbyStops: [
          {
            __typename: 'SearchBusStop',
            stop_id: 'nearest',
            stop_name: 'Nearest stop',
            stop_lat: -23.55,
            stop_lon: -46.63,
          },
          {
            __typename: 'SearchRailStation',
            station_code: 'rail-1',
            station_name: 'Rail station',
            station_aliases: [],
            railLatitude: -23.551,
            railLongitude: -46.631,
          },
          {
            __typename: 'SearchBusStop',
            stop_id: 'next',
            stop_name: 'Next stop',
            stop_lat: -23.552,
            stop_lon: -46.632,
          },
        ],
      },
    });

    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        center: { lat: -23.55, lon: -46.63 },
        radius: 750,
        stops: [
          expect.objectContaining({ stop_id: 'nearest' }),
          expect.objectContaining({ stop_id: 'rail-1' }),
          expect.objectContaining({ stop_id: 'next' }),
        ],
      }),
    );
  });

  it('returns a failed nearby result for GraphQL errors with HTTP 200', () => {
    const received = jest.fn();
    service.searchNearbyStops(-23.55, -46.63).subscribe(received);
    http.expectOne('/api/graphql').flush({
      data: { nearbyStops: [] },
      errors: [{ message: 'Typesense unavailable' }],
    });

    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        stops: [],
        center: { lat: -23.55, lon: -46.63 },
        message: 'Nearby search failed',
      }),
    );
  });
});
