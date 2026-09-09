import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ItinerariesService } from './itineraries.service';

describe('ItinerariesService', () => {
  let service: ItinerariesService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ItinerariesService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('passes the namespaced Artesp route and service date as GraphQL variables', () => {
    const response = {
      status: 'NOT_FOUND',
      serviceDate: '2026-09-08',
      route: null,
      operatorName: null,
      patterns: [],
    };
    const received = jest.fn();
    service.load('artesp:123', '2026-09-08').subscribe(received);
    const request = http.expectOne('/api/graphql');
    expect(request.request.body.variables).toEqual({
      routeId: 'artesp:123',
      serviceDate: '2026-09-08',
    });
    request.flush({ data: { busRouteItinerary: response } });
    expect(received).toHaveBeenCalledWith(response);
  });

  it('surfaces GraphQL failures instead of treating partial data as a complete timetable', () => {
    const error = jest.fn();
    const next = jest.fn();
    service.load('477A-10', '2026-09-08').subscribe({ next, error });
    http
      .expectOne('/api/graphql')
      .flush({
        data: { busRouteItinerary: { patterns: [] } },
        errors: [{ message: 'Unavailable' }],
      });
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
