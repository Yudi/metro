import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './api.tokens';
import { LoggerService } from './logger.service';
import { RailGraphqlService } from './rail-graphql.service';

describe('RailGraphqlService', () => {
  let service: RailGraphqlService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        {
          provide: LoggerService,
          useValue: { error: jest.fn() },
        },
      ],
    });

    service = TestBed.inject(RailGraphqlService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('cancels an unfinished shared fetch and allows a fresh request', () => {
    const firstSubscription = service.fetchLinesStatus().subscribe();
    const secondSubscription = service.fetchLinesStatus().subscribe();
    const firstRequest = httpTesting.expectOne('/api/graphql');

    expect(service.loading()).toBe(true);
    firstSubscription.unsubscribe();
    expect(firstRequest.cancelled).toBe(false);
    expect(service.loading()).toBe(true);

    secondSubscription.unsubscribe();
    expect(firstRequest.cancelled).toBe(true);
    expect(service.loading()).toBe(false);

    const next = jest.fn();
    service.fetchLinesStatus().subscribe(next);
    const retryRequest = httpTesting.expectOne('/api/graphql');
    retryRequest.flush({
      data: {
        railLinesStatus: {
          lines: [],
          lastUpdated: '2026-09-02T00:00:00.000Z',
          success: true,
          errorMessage: null,
        },
      },
    });

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [],
        lastUpdated: new Date('2026-09-02T00:00:00.000Z'),
      }),
    );
    expect(service.loading()).toBe(false);
  });
});
