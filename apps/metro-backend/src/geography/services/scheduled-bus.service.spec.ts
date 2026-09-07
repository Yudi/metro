import { ScheduledBusService, ScheduledStopTimeRow, selectScheduledDepartures } from './scheduled-bus.service';

const row = (overrides: Partial<ScheduledStopTimeRow> = {}): ScheduledStopTimeRow => ({
  routeId: 'artesp:001', routeShortName: '001', tripId: 'artesp:trip-1',
  headsign: 'Metrô Capão Redondo', directionId: 0, departure: '12:00:00',
  stopName: 'Terminal', startDate: '20260101', endDate: '20261231',
  weekdays: [1, 1, 1, 1, 1, 1, 1], exceptions: [], ...overrides,
});

describe('published Artesp departures', () => {
  it('interprets the current date in São Paulo even when UTC is the next day', () => {
    const departures = selectScheduledDepartures([row({
      departure: '23:55:00', startDate: '20260904', endDate: '20260904',
      weekdays: [0, 0, 0, 0, 0, 1, 0],
    })], new Date('2026-09-05T02:50:00Z'), 12);
    expect(departures).toHaveLength(1);
    expect(departures[0].departureTime).toBe('2026-09-05T02:55:00.000Z');
  });

  it('keeps Friday service at 26:59 on Saturday after its calendar end date', () => {
    const departures = selectScheduledDepartures([row({
      departure: '26:59:00', startDate: '20260904', endDate: '20260904',
      weekdays: [0, 0, 0, 0, 0, 1, 0],
    })], new Date('2026-09-05T04:00:00Z'), 12);
    expect(departures.map((departure) => departure.departureTime)).toEqual(['2026-09-05T05:59:00.000Z']);
  });

  it('honors weekday flags and looks ahead to the next scheduled service day', () => {
    const departures = selectScheduledDepartures([row({ weekdays: [0, 1, 1, 1, 1, 1, 0] })],
      new Date('2026-09-05T13:00:00Z'), 1);
    expect(departures[0].departureTime).toBe('2026-09-07T15:00:00.000Z');
  });

  it('adds date-exception service without a calendar and removes canceled service', () => {
    const now = new Date('2026-09-05T13:00:00Z');
    expect(selectScheduledDepartures([row({
      startDate: null, endDate: null, weekdays: [], exceptions: [{ date: '20260905', exceptionType: 1 }],
    })], now, 12).map((departure) => departure.departureTime)).toEqual(['2026-09-05T15:00:00.000Z']);
    expect(selectScheduledDepartures([row({
      startDate: '20260905', endDate: '20260905', exceptions: [{ date: '20260905', exceptionType: 2 }],
    })], now, 12)).toEqual([]);
  });

  it('never returns past departures, malformed times, or expired service', () => {
    expect(selectScheduledDepartures([row()], new Date('2027-01-07T13:00:00Z'), 12)).toEqual([]);
    expect(selectScheduledDepartures([row({ departure: '27:61:00' })], new Date('2026-09-05T13:00:00Z'), 12)).toEqual([]);
    const departures = selectScheduledDepartures([row({ endDate: '20260905' })], new Date('2026-09-05T16:00:00Z'), 12);
    expect(departures).toEqual([]);
  });

  it('covers the importer maximum 99-hour GTFS time and labels the feed', () => {
    const departures = selectScheduledDepartures([row({
      departure: '99:00:00', startDate: '20260901', endDate: '20260901', platformCode: 'A',
    })], new Date('2026-09-05T05:00:00Z'), 12);
    expect(departures).toHaveLength(1);
    expect(departures[0]).toMatchObject({ departureTime: '2026-09-05T06:00:00.000Z', sourceAgency: 'artesp', platformCode: 'A' });
  });

  it('sorts and limits distinct departures even if trip rows arrive unordered', () => {
    const departures = selectScheduledDepartures([
      row({ departure: '14:00:00', tripId: 'artesp:later' }), row(), row(),
    ], new Date('2026-09-05T13:00:00Z'), 2);
    expect(departures.map((departure) => departure.tripId)).toEqual(['artesp:trip-1', 'artesp:later']);
  });

  it('keeps a less frequent route represented when per-route mode is requested', () => {
    const now = new Date('2026-09-05T13:00:00Z');
    const departures = selectScheduledDepartures([
      ...Array.from({ length: 6 }, (_, index) => row({
        routeId: 'artesp:frequent', routeShortName: '010', tripId: `artesp:frequent-${index}`,
        departure: `${String(12 + index).padStart(2, '0')}:00:00`,
      })),
      row({ routeId: 'artesp:less-frequent', routeShortName: '020', tripId: 'artesp:less-frequent-1', departure: '18:00:00' }),
    ], now, 1, 1);

    expect(departures.map((departure) => departure.routeId)).toEqual([
      'artesp:frequent', 'artesp:less-frequent',
    ]);
  });

  it('caps each route independently at five departures', () => {
    const departures = selectScheduledDepartures([
      ...Array.from({ length: 7 }, (_, index) => row({
        routeId: 'artesp:frequent', routeShortName: '010', tripId: `artesp:frequent-${index}`,
        departure: `${String(12 + index).padStart(2, '0')}:00:00`,
        startDate: '20260905', endDate: '20260905', weekdays: [0, 0, 0, 0, 0, 0, 1],
      })),
      ...Array.from({ length: 2 }, (_, index) => row({
        routeId: 'artesp:other', routeShortName: '020', tripId: `artesp:other-${index}`,
        departure: `${String(20 + index).padStart(2, '0')}:00:00`,
        startDate: '20260905', endDate: '20260905', weekdays: [0, 0, 0, 0, 0, 0, 1],
      })),
    ], new Date('2026-09-05T13:00:00Z'), 1, 5);

    expect(departures).toHaveLength(7);
    expect(departures.filter((departure) => departure.routeId === 'artesp:frequent')).toHaveLength(5);
    expect(departures.filter((departure) => departure.routeId === 'artesp:other')).toHaveLength(2);
  });
});

describe('ScheduledBusService request scope', () => {
  it('expands physical members and restricts the query to the static feed', async () => {
    const query = jest.fn().mockResolvedValue([row()]);
    const service = new ScheduledBusService({ $queryRaw: query } as never);
    const result = await service.getDepartures('42', 1, new Date('2026-09-05T13:00:00Z'));
    expect(result[0].routeId).toBe('artesp:001');
    expect(query.mock.calls[0][0].join(' ')).toContain('physical_stop_members');
    expect(query.mock.calls[0][0].join(' ')).toContain("r.source_agency = 'artesp'");
  });

  it.each([0, -1, 51, 1.5])('rejects invalid limits before querying: %s', async (limit) => {
    const query = jest.fn();
    const service = new ScheduledBusService({ $queryRaw: query } as never);
    await expect(service.getDepartures('42', limit)).rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([0, -1, 6, 1.5])('rejects invalid per-route limits before querying: %s', async (perRouteLimit) => {
    const query = jest.fn();
    const service = new ScheduledBusService({ $queryRaw: query } as never);
    await expect(service.getDepartures('42', 12, undefined, perRouteLimit)).rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
  });
});
