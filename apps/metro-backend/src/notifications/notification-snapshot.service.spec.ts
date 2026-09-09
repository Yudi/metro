import type { NotificationKind } from '@metro/shared/notification-contracts';
import {
  NotificationSnapshotService,
  NotificationSnapshotTarget,
} from './notification-snapshot.service';
import { parseArrivalPrediction } from './notification-snapshot.utils';
import { buildNotificationMessage } from './notification-message';
import type { NotificationTriggerInput } from '@metro/shared/notification-contracts';

const NOW = new Date('2026-09-08T12:00:00.000Z');

function target(
  kind: string,
  descriptor: Record<string, unknown>,
  available = true,
): NotificationSnapshotTarget {
  return {
    id: '11111111-1111-7111-8111-111111111111',
    kind,
    label: 'Target',
    descriptor,
    available,
  };
}

function service(overrides: Record<string, unknown> = {}) {
  const rail = {
    getLinesStatus: jest.fn(),
    ...(overrides['rail'] as object | undefined),
  };
  const headway = {
    getHeadway: jest.fn(),
    ...(overrides['headway'] as object | undefined),
  };
  const nextTrains = {
    getNextTrains: jest.fn(),
    ...(overrides['nextTrains'] as object | undefined),
  };
  const specialRail = {
    getSpecialLinesStatus: jest.fn(),
    ...(overrides['specialRail'] as object | undefined),
  };
  const geography = {
    searchBusStops: jest.fn(),
    ...(overrides['geography'] as object | undefined),
  };
  const routeStopMapping = {
    getApiStopCode: jest.fn(),
    ...(overrides['routeStopMapping'] as object | undefined),
  };
  const busRealtime = {
    getStopArrivals: jest.fn(),
    ...(overrides['busRealtime'] as object | undefined),
  };
  const busNotices = {
    forRoutes: jest.fn(),
    ...(overrides['busNotices'] as object | undefined),
  };
  const prisma = {
    notificationTarget: { updateMany: jest.fn() },
    ...(overrides['prisma'] as object | undefined),
  };
  return {
    service: new NotificationSnapshotService(
      prisma as never,
      rail as never,
      headway as never,
      nextTrains as never,
      specialRail as never,
      geography as never,
      routeStopMapping as never,
      busRealtime as never,
      busNotices as never,
    ),
    rail,
    headway,
    nextTrains,
    specialRail,
    geography,
    routeStopMapping,
    busRealtime,
    busNotices,
    prisma,
  };
}

describe('NotificationSnapshotService', () => {
  it('expires a current-minute platform observation without renewing cached data', async () => {
    const setup = service();
    setup.nextTrains.getNextTrains.mockResolvedValue({
      lineCode: 'L10',
      stationCode: 'LUZ',
      fetchedAt: NOW,
      trains: [
        {
          destinationCode: 'RGS',
          destinationName: 'Rio Grande',
          arrivalTime: '09:00',
          isAtPlatform: true,
        },
      ],
    });
    const selection = target('rail_station', {
      lineCode: 'L10',
      stationCode: 'LUZ',
    });
    const config: NotificationTriggerInput = {
      name: 'Arrival',
      enabled: true,
      days: [2],
      windows: [{ start: '09:00', end: '10:00' }],
      timezone: 'America/Sao_Paulo',
      smart: false,
      leadMinutes: 0,
      intervalMinutes: 5,
      kind: 'rail_arrivals',
      targetIds: [selection.id],
      statusMode: 'all',
    };
    const snapshot = await setup.service.read('rail_arrivals', selection, NOW);
    expect(snapshot).not.toBeNull();
    if (!snapshot) throw new Error('Missing platform observation');
    const message = buildNotificationMessage(
      config,
      'trigger',
      selection.id,
      snapshot,
      new Date(NOW.getTime() + 10_000),
    );
    expect(message?.payload.notification.body).toContain('na plataforma');
    expect(message?.expiresAt.getTime()).toBe(NOW.getTime() + 30_000);
    const later = new Date(NOW.getTime() + 31_000);
    const cached = await setup.service.read('rail_arrivals', selection, later);
    expect(cached).toBe(snapshot);
    expect(
      buildNotificationMessage(
        config,
        'trigger',
        selection.id,
        snapshot,
        later,
      ),
    ).toBeNull();
  });
  it('parses Sao Paulo clock predictions and bounds late-night rollover', () => {
    const lateEvening = new Date('2026-09-09T01:55:00.000Z');
    expect(parseArrivalPrediction('00:05', lateEvening)).toBe(
      new Date('2026-09-09T03:05:00.000Z').getTime(),
    );
    expect(parseArrivalPrediction('22:30', lateEvening)).toBeNull();
    expect(parseArrivalPrediction('not-a-time', lateEvening)).toBeNull();
  });

  it('reads a fresh rail status and preserves non-normal operation as abnormal', async () => {
    const setup = service();
    setup.rail.getLinesStatus.mockResolvedValue({
      lines: [
        {
          code: 1,
          line: 'Linha 1 - Azul',
          statusCode: 'OperacaoTransitoria',
          statusLabel: 'Operação Transitória',
          description: 'A operação está em transição.',
        },
      ],
      lastUpdated: NOW,
      success: true,
    });

    const snapshot = await setup.service.read(
      'rail_status',
      target('rail_line', { lineCode: 'L1' }),
      NOW,
    );

    expect(snapshot).toMatchObject({
      title: 'Linha 1 - Azul',
      normal: false,
      important: false,
      statusLabel: 'Operação Transitória',
      lineCode: 'L1',
    });
    expect(setup.rail.getLinesStatus).toHaveBeenCalledTimes(1);
  });

  it.each([
    { success: false, errorMessage: undefined },
    { success: true, errorMessage: 'Status antigo' },
    {
      success: true,
      errorMessage: undefined,
      lastUpdated: new Date(NOW.getTime() - 11 * 60_000),
    },
  ])(
    'does not turn unavailable or stale rail state into a notification: %o',
    async (patch) => {
      const setup = service();
      setup.rail.getLinesStatus.mockResolvedValue({
        lines: [
          {
            code: 1,
            line: 'Linha 1 - Azul',
            statusCode: 'OperacaoNormal',
            statusLabel: 'Operação Normal',
          },
        ],
        lastUpdated: patch.lastUpdated ?? NOW,
        success: patch.success,
        errorMessage: patch.errorMessage,
      });

      await expect(
        setup.service.read(
          'rail_status',
          target('rail_line', { lineCode: 'L1' }),
          NOW,
        ),
      ).resolves.toBeNull();
    },
  );

  it('reads headway for actual CPTM lines through the shared headway reader', async () => {
    const setup = service();
    setup.headway.getHeadway.mockResolvedValue({
      lineCode: 'L10',
      stationCode: 'LUZ',
      updatedAt: NOW.getTime(),
      directions: [
        {
          direction: 'Rio Grande da Serra',
          averageSeconds: 420,
          sampleCount: 3,
          bucket: 'morning',
          isFallback: false,
        },
      ],
    });

    const snapshot = await setup.service.read(
      'rail_headway',
      target('rail_station', { lineCode: 'L10', stationCode: 'LUZ' }),
      NOW,
    );

    expect(snapshot).toMatchObject({
      title: 'Intervalo médio · Luz',
      normal: true,
    });
    expect(setup.headway.getHeadway).toHaveBeenCalledWith('L10', 'LUZ');
  });

  it('reads future rail arrivals with Sao Paulo expected instants', async () => {
    const setup = service();
    setup.nextTrains.getNextTrains.mockResolvedValue({
      lineCode: 'L10',
      stationCode: 'LUZ',
      fetchedAt: NOW,
      operationClosed: false,
      outOfSchedule: false,
      trains: [
        {
          destinationCode: 'RGS',
          destinationName: 'Rio Grande da Serra',
          arrivalTime: '09:05',
          isAtPlatform: false,
        },
        {
          destinationCode: 'BAD',
          destinationName: 'Invalid time',
          arrivalTime: '25:10',
          isAtPlatform: false,
        },
      ],
    });

    const snapshot = await setup.service.read(
      'rail_arrivals',
      target('rail_station', { lineCode: 'L10', stationCode: 'LUZ' }),
      NOW,
    );

    expect(snapshot?.arrivals).toEqual([
      {
        destination: 'Rio Grande da Serra',
        route: 'L10',
        expectedAt: new Date('2026-09-08T12:05:00.000Z').getTime(),
      },
    ]);
    expect(snapshot?.body).toContain('Rio Grande da Serra às 09:05');
    expect(setup.nextTrains.getNextTrains).toHaveBeenCalledWith('L10', 'LUZ');
  });

  it.each([
    { trains: [] },
    {
      fetchedAt: new Date(NOW.getTime() - 3 * 60_000),
      trains: [
        {
          destinationCode: 'RGS',
          destinationName: 'Rio Grande',
          arrivalTime: '09:05',
          isAtPlatform: false,
        },
      ],
    },
    {
      outOfSchedule: true,
      trains: [
        {
          destinationCode: 'RGS',
          destinationName: 'Rio Grande',
          arrivalTime: '09:05',
          isAtPlatform: false,
        },
      ],
    },
  ])(
    'skips missing, stale, or out-of-schedule rail arrivals: %o',
    async (patch) => {
      const setup = service();
      setup.nextTrains.getNextTrains.mockResolvedValue({
        lineCode: 'L10',
        stationCode: 'LUZ',
        fetchedAt: patch.fetchedAt ?? NOW,
        operationClosed: false,
        outOfSchedule: patch.outOfSchedule ?? false,
        trains: patch.trains,
      });

      await expect(
        setup.service.read(
          'rail_arrivals',
          target('rail_station', { lineCode: 'L10', stationCode: 'LUZ' }),
          NOW,
        ),
      ).resolves.toBeNull();
    },
  );

  it('requires one exact semantic bus-stop match before calling realtime', async () => {
    const setup = service();
    setup.geography.searchBusStops.mockResolvedValue([
      {
        id: 'current-row',
        stopId: 'current-stop',
        sourceAgency: 'sptrans',
        name: 'Praça da Sé',
        description: 'Plataforma A',
        latitude: -23.5505,
        longitude: -46.6333,
      },
    ]);
    setup.routeStopMapping.getApiStopCode.mockResolvedValue(123);
    setup.busRealtime.getStopArrivals.mockResolvedValue({
      p: {
        l: [
          {
            c: '8000-10',
            sl: 1,
            lt0: 'Terminal A',
            lt1: 'Terminal B',
            vs: [{ t: '09:10' }],
          },
        ],
      },
    });

    const snapshot = await setup.service.read(
      'bus_arrivals',
      target('bus_stop', {
        name: 'Praca da Se',
        description: 'Plataforma A',
        latitude: -23.5505,
        longitude: -46.6333,
      }),
      NOW,
    );

    expect(snapshot?.body).toContain('8000-10 · Terminal A às 09:10');
    expect(setup.routeStopMapping.getApiStopCode).toHaveBeenCalledWith(
      'current-stop',
    );
    expect(setup.busRealtime.getStopArrivals).toHaveBeenCalledWith(123);
  });

  it('marks an authoritative missing bus stop unavailable', async () => {
    const setup = service();
    setup.geography.searchBusStops.mockResolvedValue([]);

    const snapshot = await setup.service.read(
      'bus_arrivals',
      target('bus_stop', {
        name: 'Desaparecido',
        description: '',
        latitude: -23.5505,
        longitude: -46.6333,
      }),
      NOW,
    );

    expect(snapshot).toBeNull();
    expect(setup.prisma.notificationTarget.updateMany).toHaveBeenCalledWith({
      where: {
        id: '11111111-1111-7111-8111-111111111111',
        kind: 'bus_stop',
      },
      data: { available: false },
    });
  });

  it('does not mark a target unavailable when the catalog query fails', async () => {
    const setup = service();
    setup.geography.searchBusStops.mockRejectedValue(
      new Error('database offline'),
    );

    await expect(
      setup.service.read(
        'bus_arrivals',
        target('bus_stop', {
          name: 'Talvez',
          description: '',
          latitude: -23.5505,
          longitude: -46.6333,
        }),
        NOW,
      ),
    ).resolves.toBeNull();
    expect(setup.prisma.notificationTarget.updateMany).not.toHaveBeenCalled();
  });

  it('restores an unavailable target after a unique semantic match returns', async () => {
    const setup = service();
    setup.geography.searchBusStops.mockResolvedValue([
      {
        id: 'current',
        stopId: 'current-stop',
        sourceAgency: 'sptrans',
        name: 'Recuperado',
        description: '',
        latitude: -23.5505,
        longitude: -46.6333,
      },
    ]);
    setup.routeStopMapping.getApiStopCode.mockResolvedValue(456);
    setup.busRealtime.getStopArrivals.mockResolvedValue({
      p: {
        l: [
          {
            c: '8000-10',
            sl: 1,
            lt0: 'Destino',
            lt1: 'Volta',
            vs: [{ t: '09:10' }],
          },
        ],
      },
    });

    await setup.service.read(
      'bus_arrivals',
      target(
        'bus_stop',
        {
          name: 'Recuperado',
          description: '',
          latitude: -23.5505,
          longitude: -46.6333,
        },
        false,
      ),
      NOW,
    );

    expect(setup.prisma.notificationTarget.updateMany).toHaveBeenCalledWith({
      where: {
        id: '11111111-1111-7111-8111-111111111111',
        kind: 'bus_stop',
      },
      data: { available: true },
    });
  });

  it('skips ambiguous stop matches and shares one in-flight observation', async () => {
    const setup = service();
    setup.geography.searchBusStops.mockResolvedValue([
      {
        id: 'a',
        stopId: 'a',
        sourceAgency: 'sptrans',
        name: 'Parada',
        description: '',
        latitude: -23.5505,
        longitude: -46.6333,
      },
      {
        id: 'b',
        stopId: 'b',
        sourceAgency: 'sptrans',
        name: 'Parada',
        description: '',
        latitude: -23.55055,
        longitude: -46.63335,
      },
    ]);
    const ambiguous = await setup.service.read(
      'bus_arrivals',
      target('bus_stop', {
        name: 'Parada',
        description: '',
        latitude: -23.5505,
        longitude: -46.6333,
      }),
      NOW,
    );
    expect(ambiguous).toBeNull();
    expect(setup.routeStopMapping.getApiStopCode).not.toHaveBeenCalled();

    setup.service.clear();
    setup.geography.searchBusStops.mockResolvedValue([
      {
        id: 'one',
        stopId: 'one',
        sourceAgency: 'sptrans',
        name: 'Parada',
        description: '',
        latitude: -23.5505,
        longitude: -46.6333,
      },
    ]);
    setup.routeStopMapping.getApiStopCode.mockResolvedValue(1);
    setup.busRealtime.getStopArrivals.mockResolvedValue({
      p: {
        l: [
          {
            c: '8000-10',
            sl: 1,
            lt0: 'Destino',
            lt1: 'Volta',
            vs: [{ t: '09:10' }],
          },
        ],
      },
    });
    const descriptor = {
      name: 'Parada',
      description: '',
      latitude: -23.5505,
      longitude: -46.6333,
    };
    await Promise.all([
      setup.service.read('bus_arrivals', target('bus_stop', descriptor), NOW),
      setup.service.read('bus_arrivals', target('bus_stop', descriptor), NOW),
    ]);
    expect(setup.geography.searchBusStops).toHaveBeenCalledTimes(2);
    expect(setup.busRealtime.getStopArrivals).toHaveBeenCalledTimes(1);
  });

  it('excludes external notice identity and listing dates from semantic fingerprints', async () => {
    const setup = service();
    setup.busNotices.forRoutes
      .mockResolvedValueOnce({
        status: 'AVAILABLE',
        lastUpdated: NOW.toISOString(),
        notices: [
          {
            sourceId: 'first-id',
            sourceUrl: 'https://example.test/first',
            listedDate: '08/09',
            title: 'Desvio',
            description: 'Rua fechada',
            periodText: 'Hoje',
            routes: ['8000-10'],
            listing: 'UPCOMING',
          },
        ],
      })
      .mockResolvedValueOnce({
        status: 'AVAILABLE',
        lastUpdated: new Date(NOW.getTime() + 60_000).toISOString(),
        notices: [
          {
            sourceId: 'second-id',
            sourceUrl: 'https://example.test/second',
            listedDate: '09/09',
            title: 'Desvio',
            description: 'Rua fechada',
            periodText: 'Hoje',
            routes: ['8000-10'],
            listing: 'UPCOMING',
          },
        ],
      });

    const first = await setup.service.read(
      'bus_notices',
      target('bus_route', { routeName: '8000-10', agency: 'sptrans' }),
      NOW,
    );
    const second = await setup.service.read(
      'bus_notices',
      target('bus_route', { routeName: '8000-10', agency: 'sptrans' }),
      new Date(NOW.getTime() + CACHE_TTL_FOR_TEST),
    );

    expect(first?.fingerprint).toBe(second?.fingerprint);
    expect(setup.busNotices.forRoutes).toHaveBeenCalledTimes(2);
  });

  it('returns one snapshot per bus notice and deduplicates the same notice text', async () => {
    const setup = service();
    setup.busNotices.forRoutes.mockResolvedValue({
      status: 'AVAILABLE',
      lastUpdated: NOW.toISOString(),
      notices: [
        {
          sourceId: 'first-id',
          sourceUrl: 'https://example.test/first',
          listedDate: '08/09',
          title: 'Desvio',
          description: 'Rua fechada',
          periodText: 'Hoje',
          routes: ['8000-10'],
          listing: 'UPCOMING',
        },
        {
          sourceId: 'second-id',
          sourceUrl: 'https://example.test/second',
          listedDate: '09/09',
          title: 'Desvio',
          description: 'Rua fechada',
          periodText: 'Hoje',
          routes: ['8000-10'],
          listing: 'RECENT',
        },
        {
          sourceId: 'third-id',
          sourceUrl: 'https://example.test/third',
          listedDate: '09/09',
          title: 'Obra',
          description: 'Outra rua',
          periodText: 'Amanhã',
          routes: ['8000-10'],
          listing: 'UPCOMING',
        },
      ],
    });

    const snapshots = await setup.service.readMany(
      'bus_notices',
      target('bus_route', { routeName: '8000-10', agency: 'sptrans' }),
      NOW,
    );

    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((snapshot) => snapshot.title)).toEqual([
      'Desvio',
      'Obra',
    ]);
  });

  it('reads fixed special-line departures and ignores a special line with no departure', async () => {
    const setup = service();
    setup.specialRail.getSpecialLinesStatus.mockResolvedValue([
      {
        code: 'EA',
        line: 'Expresso Aeroporto',
        statusCode: 'OperacaoNormal',
        nextDepartures: [{ label: 'Próxima partida', time: '13:00' }],
        issues: [],
      },
      {
        code: 'GRU',
        line: 'Aeromóvel GRU',
        statusCode: 'OperacaoNormal',
        nextDepartures: [],
        issues: [],
      },
    ]);

    await expect(
      setup.service.read(
        'special_departures',
        target('special_line', { code: 'EA' }),
        NOW,
      ),
    ).resolves.toMatchObject({ title: 'Expresso Aeroporto', normal: true });
    await expect(
      setup.service.read(
        'special_departures',
        target('special_line', { code: 'GRU' }),
        NOW,
      ),
    ).resolves.toBeNull();
  });

  it('does not call a provider for a mismatched notification kind and target kind', async () => {
    const setup = service();
    await expect(
      setup.service.read(
        'rail_status' as NotificationKind,
        target('bus_stop', { lineCode: 'L1' }),
        NOW,
      ),
    ).resolves.toBeNull();
    expect(setup.rail.getLinesStatus).not.toHaveBeenCalled();
  });
});

const CACHE_TTL_FOR_TEST = 60_001;
