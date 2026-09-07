import {
  groupScheduledBusDepartures,
  formatBusFare,
  formatScheduledBusDepartureTime,
  getBusRouteIdentity,
  getBusStopIdentityAliases,
  getSptransStopCode,
  hasArtespStopData,
  sortBusRoutesByAgency,
  supportsSptransRealtime,
} from './bus.utils';

describe('bus identity and feed helpers', () => {
  it('keeps route identity independent from a colliding short name', () => {
    expect(getBusRouteIdentity({ routeId: 'artesp:001' })).toBe('artesp:001');
    expect(getBusRouteIdentity({ routeId: '001' })).toBe('001');
  });

  it('allows realtime only for SPTrans routes', () => {
    expect(
      supportsSptransRealtime({
        routeId: '001',
        sourceAgency: 'SPTRANS',
        supportsRealtime: true,
      }),
    ).toBe(true);
    expect(
      supportsSptransRealtime({
        routeId: 'artesp:001',
        sourceAgency: 'ARTESP',
        supportsRealtime: true,
      }),
    ).toBe(false);
    expect(
      supportsSptransRealtime({ routeId: 'artesp:001' }),
    ).toBe(false);
  });

  it('resolves only the SPTrans member of a merged physical stop', () => {
    expect(
      getSptransStopCode({
        stopId: 'artesp:42',
        sourceAgency: 'ARTESP',
        mergedStopIds: ['artesp:42', '123456'],
      }),
    ).toBe('123456');
    expect(
      getSptransStopCode({
        stopId: 'artesp:42',
        sourceAgency: 'ARTESP',
        mergedStopIds: ['artesp:42'],
      }),
    ).toBeNull();
    expect(
      hasArtespStopData({
        stopId: '123456',
        sourceAgency: 'SPTRANS',
        mergedStopIds: ['123456', 'artesp:42'],
      }),
    ).toBe(true);
  });

  it('keeps backend-issued stop aliases addressable after a stop is grouped', () => {
    expect(
      getBusStopIdentityAliases({
        stopId: '340015325',
        sourceId: '340015325',
        mergedStopIds: ['340015325', 'artesp:42'],
      }),
    ).toEqual(['340015325', 'artesp:42']);
  });

  it('never promotes a source ID to a stop identity', () => {
    const artespAliases = getBusStopIdentityAliases({
      stopId: 'artesp:42',
      sourceAgency: 'ARTESP',
      sourceId: '42',
      mergedStopIds: ['artesp:42'],
    });
    const qualifiedSourceIdAliases = getBusStopIdentityAliases({
      stopId: '340015325',
      sourceAgency: 'SPTRANS',
      sourceId: 'artesp:42',
      mergedStopIds: [],
    });

    expect(artespAliases).toEqual(['artesp:42']);
    expect(artespAliases).not.toContain('42');
    expect(qualifiedSourceIdAliases).toEqual(['340015325']);
    expect(qualifiedSourceIdAliases).not.toContain('artesp:42');
  });

  it('keeps a saved Artesp alias addressable by the merged SPTrans record', () => {
    expect(
      getBusStopIdentityAliases({
        stopId: '340015325',
        sourceAgency: 'SPTRANS',
        sourceId: '340015325',
        mergedStopIds: ['340015325', 'artesp:42'],
      }),
    ).toContain('artesp:42');
  });

  it('formats route fares with the fare currency', () => {
    expect(formatBusFare({ price: 5.5, currency: 'BRL' })).toContain('5,50');
  });

  it('orders bus agencies with SPTrans immediately before Artesp', () => {
    expect(
      sortBusRoutesByAgency([
        { routeId: 'other:1', sourceAgency: 'other' },
        { routeId: 'artesp:001', sourceAgency: 'artesp' },
        { routeId: '001', sourceAgency: 'sptrans' },
      ]).map((route) => route.routeId),
    ).toEqual(['001', 'artesp:001', 'other:1']);
  });

  it('marks tomorrow without displaying a full date', () => {
    const now = new Date('2026-09-05T12:00:00-03:00');
    expect(
      formatScheduledBusDepartureTime(
        '2026-09-06T04:00:00-03:00',
        now,
      ),
    ).toBe('04:00 · amanhã');
  });

  it('compares departure dates in America/Sao_Paulo across UTC midnight', () => {
    const now = new Date('2026-09-07T23:30:00-03:00');

    expect(
      formatScheduledBusDepartureTime('2026-09-08T02:00:00Z', now),
    ).toBe('23:00');
    expect(
      formatScheduledBusDepartureTime('2026-09-08T03:00:00Z', now),
    ).toBe('00:00 · amanhã');
  });
  it('does not add a weekday to today and identifies later service days', () => {
    const now = new Date('2026-09-07T12:00:00-03:00');
    expect(formatScheduledBusDepartureTime('2026-09-07T14:30:00-03:00', now)).toBe('14:30');
    expect(formatScheduledBusDepartureTime('2026-09-09T04:00:00-03:00', now)).toBe('04:00 · qua');
  });

  it('groups each route independently, sorts its departures and caps each group at five', () => {
    const departures = Array.from({ length: 7 }, (_, index) => ({
      routeId: 'artesp:001',
      departureTime: `2026-09-07T14:${String(index * 5).padStart(2, '0')}:00-03:00`,
    })).reverse();
    departures.push({ routeId: '001', departureTime: '2026-09-07T14:02:00-03:00' });
    const groups = groupScheduledBusDepartures(departures);
    expect(groups.map((group) => group.routeId)).toEqual(['artesp:001', '001']);
    expect(groups.map((group) => group.departures.length)).toEqual([5, 1]);
    expect(groups[0].departures[0].departureTime).toContain('14:00');
    expect(groups[0].departures[4].departureTime).toContain('14:20');
    expect(departures[0].departureTime).toContain('14:30');
    expect(groupScheduledBusDepartures([])).toEqual([]);
  });

});
