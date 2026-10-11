import {
  findRouteForArrivalLine,
  getMinutesUntilArrival,
  getNextArrivalEstimate,
  getStationSpacing,
  getUniqueRouteIds,
} from './stop-arrivals-view.utils';
import type { BusRouteGraphQL } from '../../geography/geography-graphql.service';
import type { LineWithVehicles } from '../../realtime/realtime-websocket.service';

const outbound = {
  routeId: 'current-feed-id', shortName: '001', favoriteCode: 'saved-outbound',
  destination: 'Terminal Centro', directionId: 1,
} as BusRouteGraphQL;
const inbound = { ...outbound, favoriteCode: 'saved-inbound', destination: 'Terminal Bairro', directionId: 0 };
const line = {
  c: '001', sl: 1, lt0: 'Terminal Centro', lt1: 'Terminal Bairro', cl: 11, qv: 0, vs: [],
} as LineWithVehicles;

describe('bus direction arrivals', () => {
  it('matches the destination without assuming realtime and GTFS direction numbers agree', () => {
    expect(findRouteForArrivalLine(line, [inbound, outbound])).toBe(outbound);
    expect(findRouteForArrivalLine({ ...line, sl: 2 }, [outbound, inbound])).toBe(inbound);
  });

  it('does not route an ambiguous or unknown destination to the opposite service', () => {
    expect(findRouteForArrivalLine({ ...line, lt0: 'Unknown' }, [outbound, inbound])).toBeUndefined();
    expect(findRouteForArrivalLine(line, [outbound, { ...outbound }])).toBeUndefined();
  });

  it('uses current feed IDs for rail connection lookups', () => {
    expect(getUniqueRouteIds([outbound, inbound])).toEqual(['current-feed-id']);
  });
});

describe('next arrival estimate', () => {
  afterEach(() => jest.useRealTimers());

  it('uses the nearest valid vehicle time across the route arrivals', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-10T12:00:00'));

    expect(
      getNextArrivalEstimate([
        {
          ...line,
          vs: [createVehicle(1, '12:08'), createVehicle(2, '12:03')],
        },
        {
          ...line,
          c: '002-10',
          vs: [createVehicle(3, '12:05')],
        },
      ]),
    ).toBe('3 min');
  });

  it('returns no estimate when there are no vehicles with a valid time', () => {
    expect(getNextArrivalEstimate([])).toBeNull();
    expect(
      getNextArrivalEstimate([
        { ...line, vs: [] },
        { ...line, vs: [createVehicle(1), createVehicle(2, 'not a time')] },
      ]),
    ).toBeNull();
  });

  it('keeps the header estimate and vehicle countdown aligned at the current minute', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 10, 12, 0, 59));
    const timedLine = { ...line, vs: [createVehicle(1, '12:00')] };

    expect(getNextArrivalEstimate([timedLine])).toBe('0 min');
    expect(getMinutesUntilArrival('12:00')).toBe('Chegando');
  });

  it('switches to hours at one hour and handles estimates across midnight', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 10, 12, 0));

    expect(getNextArrivalEstimate([{ ...line, vs: [createVehicle(1, '12:59')] }])).toBe(
      '59 min',
    );
    expect(getNextArrivalEstimate([{ ...line, vs: [createVehicle(1, '13:00')] }])).toBe(
      '1h00min',
    );
    expect(getNextArrivalEstimate([{ ...line, vs: [createVehicle(1, '13:05')] }])).toBe(
      '1h05min',
    );
    expect(getMinutesUntilArrival('13:05')).toBe('Em 1h05min');

    jest.setSystemTime(new Date(2026, 9, 10, 23, 50));
    expect(getNextArrivalEstimate([{ ...line, vs: [createVehicle(1, '00:55')] }])).toBe(
      '1h05min',
    );
  });
});

describe('rail station spacing', () => {
  it('shows stop counts before the first station and between stations', () => {
    expect(getStationSpacing(createRailStation('first', 'Pinheiros', 3))).toBe(
      'Em 3 paradas',
    );
    expect(
      getStationSpacing(
        createRailStation('next', 'Osasco', 8),
        createRailStation('first', 'Pinheiros', 3),
      ),
    ).toBe('Mais 5 paradas');
  });

  it('labels zero-distance counts and skips unknown or decreasing counts', () => {
    expect(getStationSpacing(createRailStation('current', 'Pinheiros', 0))).toBe(
      'Neste ponto',
    );
    expect(
      getStationSpacing(
        createRailStation('same', 'Osasco', 3),
        createRailStation('first', 'Pinheiros', 3),
      ),
    ).toBe('Na mesma parada');
    expect(getStationSpacing(createRailStation('unknown', 'Unknown'))).toBeNull();
    expect(
      getStationSpacing(
        createRailStation('earlier', 'Earlier', 2),
        createRailStation('later', 'Later', 3),
      ),
    ).toBeNull();
  });
});

function createVehicle(p: number, t?: string) {
  return {
    p,
    a: false,
    ta: '2026-10-10T12:00:00.000Z',
    py: 0,
    px: 0,
    ...(t === undefined ? {} : { t }),
  };
}

function createRailStation(
  id: string,
  name: string,
  stopsUntil?: number | null,
) {
  return { id, name, lines: ['Verde'], distanceMeters: 82, stopsUntil };
}
