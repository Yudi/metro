import { GeographyResolver } from './geography.resolver';

describe('GeographyResolver input bounds', () => {
  it('rejects oversized ID arrays before service work', async () => {
    const geographyService = {
      getMultipleBusStops: jest.fn(),
    };
    const resolver = new GeographyResolver(
      geographyService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      resolver.multipleBusStops(
        Array.from({ length: 501 }, (_, index) => `stop-${index}`),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(geographyService.getMultipleBusStops).not.toHaveBeenCalled();
  });

  it('normalizes and deduplicates bounded identifiers', async () => {
    const geographyService = {
      getMultipleBusStops: jest.fn().mockResolvedValue([]),
    };
    const resolver = new GeographyResolver(
      geographyService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await resolver.multipleBusStops([' stop-1 ', 'stop-1', 'stop-2']);

    expect(geographyService.getMultipleBusStops).toHaveBeenCalledWith([
      'stop-1',
      'stop-2',
    ]);
  });
});
