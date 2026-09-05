jest.mock('../../rail/rail.service', () => ({
  RailService: class {},
}));

import { NextTrainPollingService } from './next-train-polling.service';
import { NextTrainArrivalDto } from '../dto/next-train.dto';
import {
  isExpressoAeroportoScheduledAt,
  isExpressoLinha10ScheduledAt,
} from '@metro/shared/utils';

const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

describe('NextTrainPollingService', () => {
  let service: NextTrainPollingService;

  const externalRailProvider = {
    fetchNextTrains: jest.fn(),
    getStationName: jest.fn(),
  };
  const railService = {
    getLineStatus: jest.fn(),
  };
  const schedule = {
    isOperating: jest.fn(() => Promise.resolve(true)),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    schedule.isOperating.mockResolvedValue(true);
    service = new NextTrainPollingService(
      externalRailProvider as never,
      railService as never,
      schedule as never,
    );
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('allows a full headway around weekday 10X departures, but not the midday gap or weekends', () => {
    expect(
      isExpressoLinha10ScheduledAt(new Date('2026-06-05T05:20:00-03:00')),
    ).toBe(true);
    expect(
      isExpressoLinha10ScheduledAt(new Date('2026-06-05T09:20:00-03:00')),
    ).toBe(true);
    expect(
      isExpressoLinha10ScheduledAt(new Date('2026-06-05T12:00:00-03:00')),
    ).toBe(false);
    expect(
      isExpressoLinha10ScheduledAt(new Date('2026-06-06T06:00:00-03:00')),
    ).toBe(false);
  });

  it('allows Expresso Aeroporto arrivals up to 40 minutes early or late', () => {
    expect(
      isExpressoAeroportoScheduledAt(new Date('2026-06-05T04:20:00-03:00')),
    ).toBe(true);
    expect(
      isExpressoAeroportoScheduledAt(new Date('2026-06-05T04:19:00-03:00')),
    ).toBe(false);
    expect(
      isExpressoAeroportoScheduledAt(new Date('2026-06-05T00:40:00-03:00')),
    ).toBe(true);
    expect(
      isExpressoAeroportoScheduledAt(new Date('2026-06-05T00:41:00-03:00')),
    ).toBe(false);
  });

  it('immediately fetches a newly subscribed CPTM station when CPTM polling is already active', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-06T12:00:00-03:00'));
    const train: NextTrainArrivalDto = {
      destinationCode: 'DEST',
      destinationName: 'Destino',
      trainCurrentStationName: 'Origem',
      arrivalTime: '10:10',
      isAtPlatform: false,
      isTrainStopped: null,
      trainPositionStatus: null,
      trainNearStationName: null,
    };

    externalRailProvider.fetchNextTrains
      .mockResolvedValueOnce({
        success: true,
        trains: [train],
        isApiError: false,
      })
      .mockResolvedValueOnce({
        success: true,
        trains: [train],
        isApiError: false,
      });
    externalRailProvider.getStationName
      .mockResolvedValueOnce('Bras')
      .mockResolvedValueOnce('Luz');

    const listener = jest.fn();
    service.onPollComplete(listener);

    service.subscribe('client-1', 'L10', 'BAS');
    await flushMicrotasks();

    expect(externalRailProvider.fetchNextTrains).toHaveBeenCalledWith(
      'L10',
      'BAS',
    );

    externalRailProvider.fetchNextTrains.mockClear();
    listener.mockClear();

    service.subscribe('client-1', 'L11', 'LUZ');
    await flushMicrotasks();

    expect(externalRailProvider.fetchNextTrains).toHaveBeenCalledTimes(1);
    expect(externalRailProvider.fetchNextTrains).toHaveBeenCalledWith(
      'L11',
      'LUZ',
    );
    expect(listener).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          lineCode: 'L11',
          stationCode: 'LUZ',
          trains: [train],
          hasError: false,
          operationClosed: false,
        }),
      ]),
    );
  });

  it('marks operation closed without polling upstream after the off-hours offset when no cached trains remain', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-06T02:00:00-03:00'));
    railService.getLineStatus.mockResolvedValue({
      statusCode: 'OperacaoEncerrada',
    });
    externalRailProvider.getStationName.mockResolvedValue('Hebraica-Rebouças');

    const result = await (
      service as unknown as {
        fetchAndCacheKey(
          key: string,
          timestamp: number,
        ): Promise<{
          delta: {
            lineCode: string;
            stationCode: string;
            trains: NextTrainArrivalDto[];
            hasError: boolean;
            operationClosed: boolean;
          } | null;
          hasError: boolean;
        }>;
      }
    ).fetchAndCacheKey('L9:HBR', Date.now());

    expect(railService.getLineStatus).toHaveBeenCalledWith(9);
    expect(externalRailProvider.fetchNextTrains).not.toHaveBeenCalled();
    expect(result.delta).toEqual(
      expect.objectContaining({
        lineCode: 'L9',
        stationCode: 'HBR',
        trains: [],
        hasError: false,
        operationClosed: true,
      }),
    );
  });

  it('does not query API1 when 10X is outside its scheduled departure window', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-06T12:00:00-03:00'));
    schedule.isOperating.mockResolvedValue(false);
    externalRailProvider.getStationName.mockResolvedValue('Tamanduateí');

    const result = await (
      service as unknown as {
        fetchAndCacheKey(
          key: string,
          timestamp: number,
        ): Promise<{
          delta: {
            trains: NextTrainArrivalDto[];
            operationClosed: boolean;
            outOfSchedule: boolean;
          } | null;
        }>;
      }
    ).fetchAndCacheKey('10X:TAM', Date.now());

    expect(externalRailProvider.fetchNextTrains).not.toHaveBeenCalled();
    expect(result.delta).toEqual(
      expect.objectContaining({
        trains: [],
        operationClosed: false,
        outOfSchedule: true,
      }),
    );
  });

  it('does not query API1 when EA is outside its scheduled departure window', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-06T02:00:00-03:00'));
    schedule.isOperating.mockResolvedValue(false);
    externalRailProvider.getStationName.mockResolvedValue('Luz');

    const result = await (
      service as unknown as {
        fetchAndCacheKey(
          key: string,
          timestamp: number,
        ): Promise<{
          delta: { outOfSchedule: boolean } | null;
        }>;
      }
    ).fetchAndCacheKey('EA:LUZ', Date.now());

    expect(externalRailProvider.fetchNextTrains).not.toHaveBeenCalled();
    expect(result.delta).toEqual(
      expect.objectContaining({ outOfSchedule: true }),
    );
  });

  it('still polls during the one-hour remaining-trains tolerance after midnight', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-06T00:30:00-03:00'));
    const train: NextTrainArrivalDto = {
      destinationCode: 'DEST',
      destinationName: 'Destino',
      trainCurrentStationName: 'Origem',
      arrivalTime: '00:42',
      isAtPlatform: false,
      isTrainStopped: null,
    };
    externalRailProvider.fetchNextTrains.mockResolvedValue({
      success: true,
      trains: [train],
      isApiError: false,
    });
    externalRailProvider.getStationName.mockResolvedValue('Hebraica-Rebouças');

    const result = await (
      service as unknown as {
        fetchAndCacheKey(
          key: string,
          timestamp: number,
        ): Promise<{
          delta: {
            trains: NextTrainArrivalDto[];
            operationClosed: boolean;
          } | null;
          hasError: boolean;
        }>;
      }
    ).fetchAndCacheKey('L9:HBR', Date.now());

    expect(railService.getLineStatus).not.toHaveBeenCalled();
    expect(externalRailProvider.fetchNextTrains).toHaveBeenCalledWith(
      'L9',
      'HBR',
    );
    expect(result.delta).toEqual(
      expect.objectContaining({
        trains: [train],
        operationClosed: false,
      }),
    );
  });

  it('polls during off-hours when rail status says the line is operating', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-06T02:00:00-03:00'));
    railService.getLineStatus.mockResolvedValue({
      statusCode: 'OperacaoNormal',
    });
    externalRailProvider.fetchNextTrains.mockResolvedValue({
      success: true,
      trains: [],
      isApiError: false,
    });
    externalRailProvider.getStationName.mockResolvedValue('Hebraica-Rebouças');

    const result = await (
      service as unknown as {
        fetchAndCacheKey(
          key: string,
          timestamp: number,
        ): Promise<{
          delta: {
            trains: NextTrainArrivalDto[];
            operationClosed: boolean;
          } | null;
          hasError: boolean;
        }>;
      }
    ).fetchAndCacheKey('L9:HBR', Date.now());

    expect(railService.getLineStatus).toHaveBeenCalledWith(9);
    expect(externalRailProvider.fetchNextTrains).toHaveBeenCalledWith(
      'L9',
      'HBR',
    );
    expect(result.delta).toEqual(
      expect.objectContaining({
        trains: [],
        operationClosed: false,
      }),
    );
  });

  it('keeps polling when rail status is unavailable', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-06T02:00:00-03:00'));
    railService.getLineStatus.mockRejectedValue(new Error('status offline'));
    externalRailProvider.fetchNextTrains.mockResolvedValue({
      success: true,
      trains: [],
      isApiError: false,
    });
    externalRailProvider.getStationName.mockResolvedValue('Hebraica-Rebouças');

    const result = await (
      service as unknown as {
        fetchAndCacheKey(
          key: string,
          timestamp: number,
        ): Promise<{ delta: { operationClosed: boolean } | null }>;
      }
    ).fetchAndCacheKey('L9:HBR', Date.now());

    expect(externalRailProvider.fetchNextTrains).toHaveBeenCalledWith(
      'L9',
      'HBR',
    );
    expect(result.delta).toEqual(
      expect.objectContaining({ operationClosed: false }),
    );
  });

  it('does not let an older overlapping poll overwrite a newer result', async () => {
    const older = deferred<{
      success: boolean;
      trains: NextTrainArrivalDto[];
      isApiError: boolean;
    }>();
    const newer = deferred<{
      success: boolean;
      trains: NextTrainArrivalDto[];
      isApiError: boolean;
    }>();
    const olderTrain = createTrain('OLD');
    const newerTrain = createTrain('NEW');
    externalRailProvider.fetchNextTrains
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    externalRailProvider.getStationName.mockResolvedValue('Estação');
    const fetchAndCacheKey = (
      service as unknown as {
        fetchAndCacheKey(key: string, timestamp: number): Promise<unknown>;
      }
    ).fetchAndCacheKey.bind(service);

    const olderPoll = fetchAndCacheKey('L9:HBR', 100);
    const newerPoll = fetchAndCacheKey('L9:HBR', 200);
    newer.resolve({ success: true, trains: [newerTrain], isApiError: false });
    await newerPoll;
    older.resolve({ success: true, trains: [olderTrain], isApiError: false });
    await olderPoll;

    expect(service.getCached('L9', 'HBR')).toEqual(
      expect.objectContaining({ trains: [newerTrain], fetchedAt: 200 }),
    );
  });

  it('publishes train data when station metadata lookup fails', async () => {
    const train = createTrain('DEST');
    externalRailProvider.fetchNextTrains.mockResolvedValue({
      success: true,
      trains: [train],
      isApiError: false,
    });
    externalRailProvider.getStationName.mockRejectedValue(
      new Error('metadata offline'),
    );

    const result = await (
      service as unknown as {
        fetchAndCacheKey(
          key: string,
          timestamp: number,
        ): Promise<{ delta: { trains: NextTrainArrivalDto[] } | null }>;
      }
    ).fetchAndCacheKey('L9:HBR', 100);

    expect(result.delta).toEqual(expect.objectContaining({ trains: [train] }));
    expect(service.getCached('L9', 'HBR')?.stationName).toBeTruthy();
  });

  it.each(['rejected', 'missing'])('retries %s station metadata on a later poll', async (failure) => {
    externalRailProvider.fetchNextTrains.mockResolvedValue({
      trains: [], isApiError: false,
    });
    if (failure === 'rejected') {
      externalRailProvider.getStationName.mockRejectedValueOnce(new Error('offline'));
    } else {
      externalRailProvider.getStationName.mockResolvedValueOnce(null);
    }
    externalRailProvider.getStationName.mockResolvedValue('Recovered station');
    const poll = (service as unknown as {
      fetchAndCacheKey(key: string, timestamp: number): Promise<unknown>;
    }).fetchAndCacheKey.bind(service);

    await poll('L11:LUZ', 100);
    expect(service.getCached('L11', 'LUZ')?.stationName).toBe('LUZ');
    await poll('L11:LUZ', 200);
    await poll('L11:LUZ', 300);

    expect(service.getCached('L11', 'LUZ')?.stationName).toBe('Recovered station');
    expect(externalRailProvider.getStationName).toHaveBeenCalledTimes(2);
  });

  it.each(['unsubscribe', 'unsubscribeAll'] as const)(
    'rejects the old poll after %s and immediate resubscription',
    async (unsubscribe) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-06T12:00:00-03:00'));
      const older = deferred<{ trains: NextTrainArrivalDto[]; isApiError: boolean }>();
      externalRailProvider.fetchNextTrains
        .mockReturnValueOnce(older.promise)
        .mockResolvedValue({ trains: [createTrain('NEW')], isApiError: false });
      externalRailProvider.getStationName.mockResolvedValue('Estação');
      service.subscribe('old-owner', 'L9', 'HBR');
      await flushMicrotasks();
      service.subscribe('other-owner', 'L9', 'PIN');
      await flushMicrotasks();

      if (unsubscribe === 'unsubscribe') {
        service.unsubscribe('old-owner', 'L9', 'HBR');
      } else {
        service.unsubscribeAll('old-owner');
      }
      service.subscribe('new-owner', 'L9', 'HBR');
      await flushMicrotasks();
      expect(service.getCached('L9', 'HBR')?.trains[0].destinationCode).toBe('NEW');

      older.resolve({ trains: [createTrain('OLD')], isApiError: false });
      await flushMicrotasks();
      expect(service.getCached('L9', 'HBR')?.trains[0].destinationCode).toBe('NEW');
    },
  );

  it('keeps polling off-hours while cached train data is still relevant', async () => {
    jest.useFakeTimers();
    const cachedTrain: NextTrainArrivalDto = {
      destinationCode: 'OLD',
      destinationName: 'Antigo',
      trainCurrentStationName: 'Origem',
      arrivalTime: '01:30',
      isAtPlatform: false,
      isTrainStopped: null,
    };
    const refreshedTrain: NextTrainArrivalDto = {
      ...cachedTrain,
      arrivalTime: '01:35',
    };

    externalRailProvider.fetchNextTrains.mockResolvedValueOnce({
      success: true,
      trains: [cachedTrain],
      isApiError: false,
    });
    externalRailProvider.getStationName.mockResolvedValue('Hebraica-Rebouças');

    await (
      service as unknown as {
        fetchAndCacheKey(key: string, timestamp: number): Promise<unknown>;
      }
    ).fetchAndCacheKey(
      'L9:HBR',
      new Date('2026-06-06T00:30:00-03:00').getTime(),
    );

    jest.setSystemTime(new Date('2026-06-06T02:00:00-03:00'));
    externalRailProvider.fetchNextTrains.mockResolvedValueOnce({
      success: true,
      trains: [refreshedTrain],
      isApiError: false,
    });

    const result = await (
      service as unknown as {
        fetchAndCacheKey(
          key: string,
          timestamp: number,
        ): Promise<{
          delta: {
            trains: NextTrainArrivalDto[];
            operationClosed: boolean;
          } | null;
          hasError: boolean;
        }>;
      }
    ).fetchAndCacheKey('L9:HBR', Date.now());

    expect(railService.getLineStatus).not.toHaveBeenCalled();
    expect(externalRailProvider.fetchNextTrains).toHaveBeenLastCalledWith(
      'L9',
      'HBR',
    );
    expect(result.delta).toEqual(
      expect.objectContaining({
        trains: [refreshedTrain],
        operationClosed: false,
      }),
    );
  });
});

function createTrain(destinationCode: string): NextTrainArrivalDto {
  return {
    destinationCode,
    destinationName: destinationCode,
    trainCurrentStationName: 'Origem',
    arrivalTime: '10:10',
    isAtPlatform: false,
    isTrainStopped: null,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
