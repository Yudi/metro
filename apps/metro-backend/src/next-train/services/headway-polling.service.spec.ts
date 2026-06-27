jest.mock('./headway-tracking.service', () => ({
  HeadwayTrackingService: class {},
}));
jest.mock('./cptm-headway-tracking.service', () => ({
  CptmHeadwayTrackingService: class {},
}));

import { HeadwayPollingService } from './headway-polling.service';

describe('HeadwayPollingService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('polls CPTM lines through one shared periodic round-robin', async () => {
    jest.useFakeTimers();
    const externalRailProvider = {
      getStationCodes: jest.fn(async () => ['LUZ']),
      fetchHeadwayObservations: jest.fn(async () => []),
    };
    const cptmHeadwayTracking = {
      processObservations: jest.fn(async () => undefined),
    };
    const nextTrainPolling = {
      getCached: jest.fn(() => null),
      onPollComplete: jest.fn(),
    };
    const service = new HeadwayPollingService(
      { get: jest.fn() } as never,
      externalRailProvider as never,
      {} as never,
      cptmHeadwayTracking as never,
      nextTrainPolling as never,
      { getLineStatus: jest.fn() } as never,
    );
    (service as unknown as { isRunning: boolean }).isRunning = true;

    await (
      service as unknown as {
        startLinePolling(lineCode: 'L11'): Promise<void>;
      }
    ).startLinePolling('L11');

    expect(externalRailProvider.getStationCodes).toHaveBeenCalledWith('L11');

    await jest.advanceTimersByTimeAsync(2_000);

    expect(externalRailProvider.fetchHeadwayObservations).toHaveBeenCalledTimes(1);
    expect(externalRailProvider.fetchHeadwayObservations).toHaveBeenCalledWith(
      'L11',
      'LUZ',
    );
    expect(cptmHeadwayTracking.processObservations).toHaveBeenCalledTimes(1);

    service.onModuleDestroy();
  });

  it('uses only one shared timer for multiple CPTM lines', async () => {
    jest.useFakeTimers();
    const externalRailProvider = {
      getStationCodes: jest.fn(async () => ['LUZ']),
    };
    const service = new HeadwayPollingService(
      { get: jest.fn() } as never,
      externalRailProvider as never,
      {} as never,
      {} as never,
      { getCached: jest.fn(), onPollComplete: jest.fn() } as never,
      { getLineStatus: jest.fn() } as never,
    );
    (service as unknown as { isRunning: boolean }).isRunning = true;

    const startLinePolling = (
      service as unknown as {
        startLinePolling(lineCode: 'L10' | 'L11'): Promise<void>;
      }
    ).startLinePolling.bind(service);
    await startLinePolling('L10');
    await startLinePolling('L11');

    expect(
      (
        service as unknown as {
          activePollers: Set<string>;
        }
      ).activePollers,
    ).toEqual(new Set(['headway:cptm-global']));

    service.onModuleDestroy();
  });

  it('waits for the current CPTM background request before dispatching another', async () => {
    jest.useFakeTimers();
    let resolveFirstRequest!: () => void;
    const firstRequest = new Promise<void>((resolve) => {
      resolveFirstRequest = resolve;
    });
    const externalRailProvider = {
      getStationCodes: jest.fn(async () => ['LUZ', 'BAS']),
      fetchHeadwayObservations: jest
        .fn()
        .mockImplementationOnce(async () => {
          await firstRequest;
          return [];
        })
        .mockResolvedValue([]),
    };
    const service = new HeadwayPollingService(
      { get: jest.fn() } as never,
      externalRailProvider as never,
      {} as never,
      { processObservations: jest.fn(async () => undefined) } as never,
      { getCached: jest.fn(() => null), onPollComplete: jest.fn() } as never,
      { getLineStatus: jest.fn() } as never,
    );
    (service as unknown as { isRunning: boolean }).isRunning = true;

    await (
      service as unknown as {
        startLinePolling(lineCode: 'L11'): Promise<void>;
      }
    ).startLinePolling('L11');
    await jest.advanceTimersByTimeAsync(1_000);
    await jest.advanceTimersByTimeAsync(10_000);

    expect(externalRailProvider.fetchHeadwayObservations).toHaveBeenCalledTimes(1);

    resolveFirstRequest();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1_000);

    expect(externalRailProvider.fetchHeadwayObservations).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
  });

  it('skips off-hours polling when the line operation is closed', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-06T02:00:00-03:00'));
    const externalRailProvider = {
      fetchHeadwayObservations: jest.fn(async () => []),
    };
    const railService = {
      getLineStatus: jest.fn(async () => ({
        statusCode: 'OperacaoEncerrada',
      })),
    };
    const service = new HeadwayPollingService(
      { get: jest.fn() } as never,
      externalRailProvider as never,
      {} as never,
      { processObservations: jest.fn(async () => undefined) } as never,
      { getCached: jest.fn(), onPollComplete: jest.fn() } as never,
      railService as never,
    );

    await (
      service as unknown as {
        pollStation(lineCode: 'L11', stationCode: string): Promise<void>;
      }
    ).pollStation('L11', 'LUZ');

    expect(railService.getLineStatus).toHaveBeenCalledWith(11);
    expect(externalRailProvider.fetchHeadwayObservations).not.toHaveBeenCalled();
  });

  it.each([
    ['after closing', '2026-06-06T00:30:00-03:00'],
    ['before opening', '2026-06-06T03:30:00-03:00'],
  ])(
    'polls with OperacaoEncerrada during the one-hour remaining-trains tolerance %s',
    async (_period, timestamp) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(timestamp));
      const externalRailProvider = {
        fetchHeadwayObservations: jest.fn(async () => []),
      };
      const railService = {
        getLineStatus: jest.fn(async () => ({
          statusCode: 'OperacaoEncerrada',
        })),
      };
      const service = new HeadwayPollingService(
        { get: jest.fn() } as never,
        externalRailProvider as never,
        {} as never,
        { processObservations: jest.fn(async () => undefined) } as never,
        { getCached: jest.fn(), onPollComplete: jest.fn() } as never,
        railService as never,
      );

      await (
        service as unknown as {
          pollStation(lineCode: 'L11', stationCode: string): Promise<void>;
        }
      ).pollStation('L11', 'LUZ');

      expect(railService.getLineStatus).toHaveBeenCalledWith(11);
      expect(externalRailProvider.fetchHeadwayObservations).toHaveBeenCalledWith(
        'L11',
        'LUZ',
      );
    },
  );

  it('polls during off-hours when the line is still operating', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-06T03:00:00-03:00'));
    const externalRailProvider = {
      fetchHeadwayObservations: jest.fn(async () => []),
    };
    const railService = {
      getLineStatus: jest.fn(async () => ({
        statusCode: 'OperacaoNormal',
      })),
    };
    const service = new HeadwayPollingService(
      { get: jest.fn() } as never,
      externalRailProvider as never,
      {} as never,
      { processObservations: jest.fn(async () => undefined) } as never,
      { getCached: jest.fn(), onPollComplete: jest.fn() } as never,
      railService as never,
    );

    await (
      service as unknown as {
        pollStation(lineCode: 'L11', stationCode: string): Promise<void>;
      }
    ).pollStation('L11', 'LUZ');
    await (
      service as unknown as {
        pollStation(lineCode: 'L11', stationCode: string): Promise<void>;
      }
    ).pollStation('L11', 'BAS');

    expect(railService.getLineStatus).toHaveBeenCalledTimes(1);
    expect(externalRailProvider.fetchHeadwayObservations).toHaveBeenCalledWith(
      'L11',
      'LUZ',
    );
    expect(externalRailProvider.fetchHeadwayObservations).toHaveBeenCalledWith(
      'L11',
      'BAS',
    );
  });

  it.each(['OperacaoEncerrada', 'Paralisada'])(
    'rechecks an off-hours line with status %s only every five minutes',
    async (statusCode) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-06T02:00:00-03:00'));
      const railService = {
        getLineStatus: jest.fn(async () => ({ statusCode })),
      };
      const externalRailProvider = {
        fetchHeadwayObservations: jest.fn(),
      };
      const service = new HeadwayPollingService(
        { get: jest.fn() } as never,
        externalRailProvider as never,
        {} as never,
        {} as never,
        { getCached: jest.fn(), onPollComplete: jest.fn() } as never,
        railService as never,
      );
      const pollStation = (
        service as unknown as {
          pollStation(lineCode: 'L11', stationCode: string): Promise<void>;
        }
      ).pollStation.bind(service);

      await pollStation('L11', 'LUZ');
      await pollStation('L11', 'BAS');

      expect(railService.getLineStatus).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(300_000);
      await pollStation('L11', 'BAS');

      expect(railService.getLineStatus).toHaveBeenCalledTimes(2);
      expect(externalRailProvider.fetchHeadwayObservations).not.toHaveBeenCalled();
    },
  );
});
