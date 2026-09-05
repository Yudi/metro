import { CsvProcessingService } from './csv-processing.service';

describe('CsvProcessingService', () => {
  const executeRaw = jest.fn().mockResolvedValue(1);
  const prisma = {
    $transaction: jest.fn((callback: (tx: unknown) => Promise<number>) =>
      callback({
        $executeRawUnsafe: executeRaw,
        $executeRaw: executeRaw,
      } as never),
    ),
  };
  let service: CsvProcessingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CsvProcessingService(prisma as never);
  });

  it('skips malformed calendar rows while importing usable rows', async () => {
    await expect(
      (
        service as never as {
          importCalendar: (
            tx: unknown,
            rows: Record<string, string>[],
            fileName: string,
          ) => Promise<number>;
        }
      ).importCalendar(
        { $executeRawUnsafe: executeRaw, $executeRaw: executeRaw },
        [
          {
            service_id: 'weekday',
            monday: 'NaN',
            tuesday: '1',
            wednesday: '1',
            thursday: '1',
            friday: '1',
            saturday: '0',
            sunday: '0',
            start_date: '20260801',
            end_date: '20260831',
          },
          {
            service_id: 'weekend',
            monday: '0',
            tuesday: '0',
            wednesday: '0',
            thursday: '0',
            friday: '0',
            saturday: '1',
            sunday: '1',
            start_date: '20260801',
            end_date: '20260831',
          },
        ],
        'calendar.txt',
      ),
    ).resolves.toBe(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('accepts GTFS route fields that are optional or conditionally required', async () => {
    await expect(
      (
        service as never as {
          importRoutes: (
            tx: unknown,
            rows: Record<string, string>[],
            fileName: string,
          ) => Promise<number>;
        }
      ).importRoutes(
        { $executeRawUnsafe: executeRaw, $executeRaw: executeRaw },
        [
          {
            route_id: 'route',
            agency_id: '',
            route_short_name: '',
            route_long_name: 'Centro - Bairro',
            route_type: '3',
            route_color: '',
            route_text_color: '',
          },
        ],
        'routes.txt',
      ),
    ).resolves.toBe(1);
    expect(executeRaw).toHaveBeenCalled();
  });

  it('skips invalid stop sequences rather than storing zero', async () => {
    await expect(
      (
        service as never as {
          importStopTimes: (
            tx: unknown,
            rows: Record<string, string>[],
            fileName: string,
          ) => Promise<number>;
        }
      ).importStopTimes(
        { $executeRawUnsafe: executeRaw, $executeRaw: executeRaw },
        [
          {
            trip_id: 'trip',
            arrival_time: '08:00:00',
            departure_time: '08:01:00',
            stop_id: 'stop',
            stop_sequence: '-1',
          },
        ],
        'stop_times.txt',
      ),
    ).resolves.toBe(0);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('keeps a route when only its optional color is malformed', async () => {
    const count = await (
      service as never as {
        importRoutes: (
          tx: unknown,
          rows: Record<string, string>[],
          fileName: string,
        ) => Promise<number>;
      }
    ).importRoutes(
      { $executeRawUnsafe: executeRaw, $executeRaw: executeRaw },
      [
        {
          route_id: 'route',
          route_short_name: '100',
          route_long_name: 'Centro',
          route_type: '3',
          route_color: 'not-a-color',
        },
      ],
      'routes.txt',
    );

    expect(count).toBe(1);
    expect(executeRaw.mock.calls[0]).toContain('');
  });

  it('propagates CSV counter errors instead of returning an authoritative zero', async () => {
    await expect(
      service.countCsvRecords('/does/not/exist.csv'),
    ).rejects.toThrow('CSV record count failed');
  });

  it('preserves the underlying CSV failure as a non-serialized cause', async () => {
    let failure: unknown;
    try {
      await service.countCsvRecords('/does/not/exist.csv');
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error & { cause?: unknown }).cause).toBeDefined();
  });
});
