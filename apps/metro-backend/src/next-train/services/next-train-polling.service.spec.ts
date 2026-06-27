jest.mock('../../rail/rail.service', () => ({
  RailService: class {},
}));

import { NextTrainPollingService } from './next-train-polling.service';
import { NextTrainArrivalDto } from '../dto/next-train.dto';

const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
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

  beforeEach(() => {
    jest.resetAllMocks();
    service = new NextTrainPollingService(
      externalRailProvider as never,
      railService as never,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
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
        fetchAndCacheKey(
          key: string,
          timestamp: number,
        ): Promise<unknown>;
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
