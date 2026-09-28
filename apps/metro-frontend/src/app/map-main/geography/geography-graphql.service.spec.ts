import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { IncrementalGraphqlClient } from '@metro/shared/api';
import { Observable, Subject } from 'rxjs';
import type {
  BusStopGraphQL,
  RouteFullDataGraphQL,
} from './geography-graphql.service';
import { GeographyGraphQLService } from './geography-graphql.service';

interface RawStopFullDataResult {
  data?: {
    stopFullData?: {
      stop?: BusStopGraphQL | null;
      routes?: RouteFullDataGraphQL[] | null;
    } | null;
  };
  errors?: readonly { message: string; path?: readonly (string | number)[] }[];
  hasNext: boolean;
}

const stop: BusStopGraphQL = {
  id: 'stop-1',
  stopId: 'stop-1',
  name: 'Praça da Sé',
  latitude: -23.5505,
  longitude: -46.6333,
  isSubwayStation: false,
};

describe('GeographyGraphQLService incremental stop query', () => {
  let service: GeographyGraphQLService;
  let query: jest.Mock;

  beforeEach(() => {
    query = jest.fn(() => new Subject<RawStopFullDataResult>().asObservable());
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        GeographyGraphQLService,
        { provide: IncrementalGraphqlClient, useValue: { query } },
      ],
    });
    service = TestBed.inject(GeographyGraphQLService);
  });

  it('shares active consumers, delivers stop before routes, then allows a fresh query', () => {
    const updates = new Subject<RawStopFullDataResult>();
    query.mockReturnValue(updates.asObservable());
    const unusedStream = service.watchStopFullData(stop.stopId);
    const firstValues: unknown[] = [];
    const secondValues: unknown[] = [];

    expect(query).not.toHaveBeenCalled();
    const firstSubscription = service
      .watchStopFullData(stop.stopId)
      .subscribe((value) => firstValues.push(value));
    const secondSubscription = unusedStream.subscribe((value) =>
      secondValues.push(value),
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('... @defer(label: "stopRoutes")');
    expect(query.mock.calls[0][0]).not.toContain('@stream');

    updates.next({ data: { stopFullData: { stop } }, hasNext: true });
    expect(firstValues).toEqual([
      { stop, hasNext: true },
    ]);
    expect(secondValues).toEqual(firstValues);

    const errors = [
      { message: 'route resolver failed', path: ['stopFullData', 'routes'] },
    ];
    updates.next({
      data: { stopFullData: { stop, routes: null } },
      errors,
      hasNext: false,
    });
    updates.complete();
    expect(firstValues).toEqual([
      { stop, hasNext: true },
      { stop, routes: [], errors, hasNext: false },
    ]);
    expect(secondValues).toEqual(firstValues);
    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();

    query.mockReturnValue(new Subject<RawStopFullDataResult>().asObservable());
    const freshSubscription = service.watchStopFullData(stop.stopId).subscribe();
    expect(query).toHaveBeenCalledTimes(2);
    freshSubscription.unsubscribe();
  });

  it('evicts a cancelled in-flight stream so the next subscriber can retry', () => {
    const teardown = jest.fn();
    query.mockReturnValue(
      new Observable<RawStopFullDataResult>(() => teardown),
    );

    const firstSubscription = service.watchStopFullData(stop.stopId).subscribe();
    firstSubscription.unsubscribe();

    expect(teardown).toHaveBeenCalledTimes(1);

    query.mockReturnValue(new Subject<RawStopFullDataResult>().asObservable());
    const retrySubscription = service.watchStopFullData(stop.stopId).subscribe();

    expect(query).toHaveBeenCalledTimes(2);
    retrySubscription.unsubscribe();
  });
});
