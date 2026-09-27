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

  afterEach(() => http.verify());

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
