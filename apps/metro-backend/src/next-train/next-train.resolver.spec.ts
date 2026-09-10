import { NextTrainResolver } from './next-train.resolver';

describe('NextTrainResolver', () => {
  const scheduledServices = [
    {
      destinationCode: 'TUC',
      destinationName: 'Tucuruvi',
      originStationCode: 'JAB',
      originStationName: 'Jabaquara',
      nextDepartureAt: '2026-09-09T12:04:00.000Z',
      nextArrivalAt: '2026-09-09T12:14:00.000Z',
      arrivalEstimated: true,
      intervalLabel: '4 min',
      followingDepartures: [{ departureAt: '2026-09-09T12:08:00.000Z' }],
    },
  ];

  const scheduledServiceEntities = [
    expect.objectContaining({
      destinationCode: 'TUC',
      nextDepartureAt: new Date('2026-09-09T12:04:00.000Z'),
      nextArrivalAt: new Date('2026-09-09T12:14:00.000Z'),
      arrivalEstimated: true,
      intervalLabel: '4 min',
      followingDepartures: [
        expect.objectContaining({
          departureAt: new Date('2026-09-09T12:08:00.000Z'),
        }),
      ],
    }),
  ];

  let polling: { getCached: jest.Mock };
  let externalRailProvider: {
    fetchNextTrains: jest.Mock;
    fetchScheduledService: jest.Mock;
    getStationName: jest.Mock;
  };
  let headwayTracking: { getHeadway: jest.Mock };
  let schedule: { isOperating: jest.Mock };

  beforeEach(() => {
    polling = { getCached: jest.fn(() => null) };
    externalRailProvider = {
      fetchNextTrains: jest.fn(),
      fetchScheduledService: jest.fn(() => Promise.resolve([])),
      getStationName: jest.fn(),
    };
    headwayTracking = {
      getHeadway: jest.fn(() => Promise.resolve(null)),
    };
    schedule = { isOperating: jest.fn(() => Promise.resolve(true)) };
  });

  function createResolver(): NextTrainResolver {
    return new NextTrainResolver(
      polling as never,
      externalRailProvider as never,
      headwayTracking as never,
      schedule as never,
    );
  }

  it('returns scheduled services for a schedule-only line without requesting live data', async () => {
    externalRailProvider.fetchScheduledService.mockResolvedValue(
      scheduledServices,
    );
    const measuredHeadway = {
      directions: [
        {
          direction: 'Tucuruvi',
          averageSeconds: 240,
          sampleCount: 3,
        },
      ],
    };
    headwayTracking.getHeadway.mockResolvedValue(measuredHeadway);

    const result = await createResolver().getNextTrains('L1', 'LUZ');

    expect(result).toEqual(
      expect.objectContaining({
        stationCode: 'LUZ',
        stationName: 'Luz',
        lineCode: 'L1',
        trains: [],
        scheduledServices: scheduledServiceEntities,
        headway: measuredHeadway.directions,
        operationClosed: false,
        outOfSchedule: false,
      }),
    );
    expect(externalRailProvider.fetchNextTrains).not.toHaveBeenCalled();
    expect(externalRailProvider.fetchScheduledService).toHaveBeenCalledWith(
      'L1',
      'LUZ',
    );
    expect(externalRailProvider.getStationName).not.toHaveBeenCalled();
  });

  it('returns cached schedule services without refetching them', async () => {
    polling.getCached.mockReturnValue({
      lineCode: 'L1',
      stationCode: 'LUZ',
      stationName: 'Luz',
      trains: [],
      scheduledServices,
      hash: 'hash',
      fetchedAt: 100,
      hasError: false,
      operationClosed: false,
      outOfSchedule: false,
    });

    const result = await createResolver().getNextTrains('L1', 'LUZ');

    expect(result).toEqual(
      expect.objectContaining({
        scheduledServices: scheduledServiceEntities,
        trains: [],
      }),
    );
    expect(externalRailProvider.fetchNextTrains).not.toHaveBeenCalled();
    expect(externalRailProvider.fetchScheduledService).not.toHaveBeenCalled();
  });

  it('does not request schedule fallback when the special service is out of schedule', async () => {
    schedule.isOperating.mockResolvedValue(false);

    const result = await createResolver().getNextTrains('10X', 'TMD');

    expect(result).toEqual(
      expect.objectContaining({
        trains: [],
        scheduledServices: [],
        operationClosed: false,
        outOfSchedule: true,
      }),
    );
    expect(externalRailProvider.fetchNextTrains).not.toHaveBeenCalled();
    expect(externalRailProvider.fetchScheduledService).not.toHaveBeenCalled();
  });

  it('keeps scheduled data available when supplementary headway retrieval fails', async () => {
    externalRailProvider.fetchNextTrains.mockResolvedValue({
      success: true,
      trains: [],
      isApiError: false,
    });
    externalRailProvider.fetchScheduledService.mockResolvedValue(
      scheduledServices,
    );
    headwayTracking.getHeadway.mockRejectedValue(new Error('headway offline'));

    const result = await createResolver().getNextTrains('L9', 'HBR');

    expect(result).toEqual(
      expect.objectContaining({
        scheduledServices: scheduledServiceEntities,
        trains: [],
        headway: undefined,
      }),
    );
  });
});
