import { HistoricalService } from './historical.service';

describe('HistoricalService public projection', () => {
  it('records backend lifecycle events with the stable system source', async () => {
    const prisma = {
      historicalIncidentEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'incident-1' }),
      },
    };
    const service = new HistoricalService(
      prisma as never,
      { getStationName: jest.fn() } as never,
    );

    await service.onModuleInit();

    expect(prisma.historicalIncidentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'backend_lifecycle' }),
      }),
    );
  });

  it('does not expose raw diagnostic objects or exception stacks', async () => {
    const prisma = {
      historicalIncidentEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'incident-1',
            eventType: 'RETRIEVAL_ISSUE',
            observedAt: new Date('2026-08-23T12:00:00Z'),
            source: 'rail_status',
            title: 'Falha',
            metadata: {
              attemptedAt: '2026-08-23T12:00:00Z',
              privatePath: '/private/provider/client.ts',
              providerUrl: 'https://private.invalid',
            },
          },
        ]),
      },
      historicalHeadwaySnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'headway-1',
            lineCode: 'L9',
            stationCode: 'PIN',
            stationName: 'Pinheiros',
            errors: {
              reason: 'calculation_failed',
              error: {
                message: 'synthetic private marker',
                stack: '/private/provider/client.ts:10',
              },
            },
            metadata: {
              minSamples: 3,
              providerPayload: 'synthetic private marker',
            },
          },
        ]),
      },
    };
    const service = new HistoricalService(
      prisma as never,
      { getStationName: jest.fn() } as never,
    );

    const result = await service.getHistoricalData();
    const serialized = JSON.stringify(result);

    expect(result.incidents[0].metadata).toEqual({
      attemptedAt: '2026-08-23T12:00:00Z',
    });
    expect(result.headwaySnapshots[0].errors).toEqual({
      reason: 'calculation_failed',
    });
    expect(result.headwaySnapshots[0].metadata).toEqual({ minSamples: 3 });
    expect(serialized).not.toContain('synthetic private marker');
    expect(serialized).not.toContain('/private/provider');
    expect(serialized).not.toContain('providerUrl');
  });

  it('serializes open-incident creation with a database advisory lock', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      historicalIncidentEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'incident-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    const service = new HistoricalService(
      prisma as never,
      { getStationName: jest.fn() } as never,
    );

    await service.recordRetrievalIssue({
      source: 'rail_status',
      attemptedAt: new Date('2026-08-23T12:00:00Z'),
    });

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.historicalIncidentEvent.findFirst).toHaveBeenCalledTimes(
      1,
    );
    expect(transaction.historicalIncidentEvent.create).toHaveBeenCalledTimes(1);
    expect(transaction.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.historicalIncidentEvent.findFirst.mock.invocationCallOrder[0],
    );
  });
});

describe('HistoricalService polling errors', () => {
  function setup() {
    const snapshots = {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    };
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      historicalHeadwaySnapshot: snapshots,
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
      historicalHeadwaySnapshot: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new HistoricalService(
      prisma as never,
      { getStationName: jest.fn().mockResolvedValue('Ambuitá') } as never,
    );
    return { service, prisma, snapshots };
  }

  it('extends an upstream error within the same São Paulo headway bucket', async () => {
    const { service, snapshots } = setup();
    snapshots.findFirst.mockResolvedValue({
      id: 'first-error',
      observedAt: new Date('2026-09-27T15:39:42.267Z'),
      startedAt: new Date('2026-09-27T15:35:00.000Z'),
      occurrenceCount: 3,
    });

    await service.recordHeadwayError({
      lineCode: 'L8',
      stationCode: 'AMBUITA',
      source: 'headway_polling',
      reason: 'upstream_api_error',
      observedAt: new Date('2026-09-27T15:41:59.246Z'),
    });

    expect(snapshots.update).toHaveBeenCalledWith({
      where: { id: 'first-error' },
      data: {
        observedAt: new Date('2026-09-27T15:41:59.246Z'),
        startedAt: new Date('2026-09-27T15:35:00.000Z'),
        occurrenceCount: 4,
      },
    });
    expect(snapshots.create).not.toHaveBeenCalled();
  });

  it('starts a new error at the next bucket boundary', async () => {
    const { service, snapshots } = setup();
    snapshots.findFirst.mockResolvedValue({
      id: 'previous-bucket',
      observedAt: new Date('2026-09-27T15:59:59.000Z'),
      startedAt: new Date('2026-09-27T15:39:00.000Z'),
      occurrenceCount: 2,
    });

    await service.recordHeadwayError({
      lineCode: 'L8',
      stationCode: 'AMBUITA',
      source: 'headway_polling',
      reason: 'upstream_api_error',
      observedAt: new Date('2026-09-27T16:00:00.000Z'),
    });

    expect(snapshots.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startedAt: new Date('2026-09-27T16:00:00.000Z'),
        occurrenceCount: 1,
      }),
    });
    expect(snapshots.update).not.toHaveBeenCalled();
  });

  it('keeps the same night bucket on different local dates separate', async () => {
    const { service, snapshots } = setup();
    snapshots.findFirst.mockResolvedValue({
      id: 'previous-night',
      observedAt: new Date('2026-09-28T02:59:00.000Z'),
      startedAt: new Date('2026-09-28T02:40:00.000Z'),
      occurrenceCount: 2,
    });

    await service.recordHeadwayError({
      lineCode: 'L8',
      stationCode: 'AMBUITA',
      source: 'headway_polling',
      reason: 'upstream_api_error',
      observedAt: new Date('2026-09-29T02:59:00.000Z'),
    });

    expect(snapshots.create).toHaveBeenCalledTimes(1);
    expect(snapshots.update).not.toHaveBeenCalled();
  });

  it('keeps the latest time and earlier start when polls finish out of order', async () => {
    const { service, snapshots } = setup();
    snapshots.findFirst.mockResolvedValue({
      id: 'first-error',
      observedAt: new Date('2026-09-27T15:41:59.246Z'),
      startedAt: new Date('2026-09-27T15:39:42.267Z'),
      occurrenceCount: 2,
    });

    await service.recordHeadwayError({
      lineCode: 'L8',
      stationCode: 'AMBUITA',
      source: 'headway_polling',
      reason: 'upstream_api_error',
      observedAt: new Date('2026-09-27T15:38:00.000Z'),
    });

    expect(snapshots.update).toHaveBeenCalledWith({
      where: { id: 'first-error' },
      data: {
        observedAt: new Date('2026-09-27T15:41:59.246Z'),
        startedAt: new Date('2026-09-27T15:38:00.000Z'),
        occurrenceCount: 3,
      },
    });
  });

  it('keeps other polling errors as individual rows', async () => {
    const { service, prisma } = setup();

    await service.recordHeadwayError({
      lineCode: 'L8',
      stationCode: 'AMBUITA',
      source: 'headway_polling',
      reason: 'station_poll_failed',
      observedAt: new Date('2026-09-27T15:41:59.246Z'),
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.historicalHeadwaySnapshot.create).toHaveBeenCalledTimes(1);
  });
});
