import { HistoricalService } from './historical.service';

describe('HistoricalService public projection', () => {
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
