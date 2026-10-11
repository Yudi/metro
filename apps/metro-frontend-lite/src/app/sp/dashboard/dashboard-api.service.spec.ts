import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { API_BASE_URL } from '@metro/shared/api';
import { DashboardApiService } from './dashboard-api.service';

describe('DashboardApiService bus direction lookups', () => {
  let service: DashboardApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
    service = TestBed.inject(DashboardApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('resolves saved route codes to per-destination favorites', () => {
    const received = jest.fn();
    service.fetchBusFavorites(['477A-10'], []).subscribe(received);

    const request = http.expectOne('/api/graphql');
    expect(request.request.body.variables).toEqual({
      routeIds: ['477A-10'],
      stopIds: [],
    });
    expect(request.request.body.query).toContain(
      'multipleBusRoutes: favoriteBusDirections(codes: $routeIds)',
    );
    expect(request.request.body.query).toContain('favoriteCode');
    expect(request.request.body.query).toContain('requestedCode');
    expect(request.request.body.query).toContain('destination');
    expect(request.request.body.query).toContain('isCircular');
    expect(request.request.body.query).toContain('directionId');

    const response = {
      data: {
        multipleBusRoutes: [
          {
            routeId: '477A-10',
            shortName: '477A-10',
            longName: 'Sacomã – Pinheiros',
            favoriteCode: 'bus:v1:sptrans:477A-10:one:two',
            requestedCode: '477A-10',
            destination: 'Pinheiros',
            isCircular: true,
            directionId: 0,
          },
        ],
        multipleBusStops: [],
      },
    };
    request.flush(response);
    expect(received).toHaveBeenCalledWith(response);
  });

  it('loads directions serving a stop instead of whole-line routes', () => {
    const received = jest.fn();
    service.fetchRoutesForStop('701441').subscribe(received);

    const request = http.expectOne('/api/graphql');
    expect(request.request.body.variables).toEqual({ stopId: '701441' });
    expect(request.request.body.query).toContain(
      'routesForStop: busStopDirections(stopId: $stopId)',
    );
    expect(request.request.body.query).toContain('favoriteCode');
    expect(request.request.body.query).toContain('destination');
    expect(request.request.body.query).toContain('isCircular');
    expect(request.request.body.query).toContain('directionId');

    const response = {
      data: {
        routesForStop: [
          {
            routeId: '477A-10',
            shortName: '477A-10',
            longName: 'Sacomã – Pinheiros',
            favoriteCode: 'bus:v1:sptrans:477A-10:one:two',
            destination: 'Pinheiros',
            isCircular: true,
            directionId: 0,
          },
        ],
      },
    };
    request.flush(response);
    expect(received).toHaveBeenCalledWith(response.data.routesForStop);
  });
});
