import { ServiceUnavailableException } from '@nestjs/common';
import { BikeVectorTileService } from './bike-vector-tile.service';

describe('BikeVectorTileService', () => {
  it('does not represent an uninitialized bike cache as a valid empty tile', async () => {
    const service = new BikeVectorTileService(
      {} as never,
      { getCachedSummaryPayload: jest.fn().mockReturnValue(null) } as never,
    );

    await expect(service.generateBikeStationsTile(12, 1000, 1000)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
