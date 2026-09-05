import { RouteStopMappingService } from './route-stop-mapping.service';

describe('RouteStopMappingService', () => {
  const prisma = { $queryRaw: jest.fn() };
  const olhoVivo = { searchLines: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects ambiguous stop identifiers instead of parsing a numeric prefix', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ stop_id: '123junk' }])
      .mockResolvedValueOnce([{ route_id: 'BUS-1' }]);
    const service = new RouteStopMappingService(
      prisma as never,
      olhoVivo as never,
    );

    await expect(service.getApiStopCode('123junk')).resolves.toBeNull();
  });

  it('expires mappings so an updated feed can be observed without restart', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    prisma.$queryRaw
      .mockResolvedValueOnce([{ stop_id: '123' }])
      .mockResolvedValueOnce([{ route_id: 'BUS-1' }])
      .mockResolvedValueOnce([{ stop_id: '123' }])
      .mockResolvedValueOnce([{ route_id: 'BUS-1' }]);
    const service = new RouteStopMappingService(
      prisma as never,
      olhoVivo as never,
    );

    await expect(service.getApiStopCode('123')).resolves.toBe(123);
    await expect(service.getApiStopCode('123')).resolves.toBe(123);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);

    jest.setSystemTime(60 * 60 * 1000);
    await expect(service.getApiStopCode('123')).resolves.toBe(123);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
    jest.useRealTimers();
  });
});
