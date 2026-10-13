import { encodeBusDirectionFavorite, encodeBusLineFavorite } from '@metro/shared/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { BusDirectionService } from './bus-direction.service';
import { RouteBoundsService } from './route-bounds.service';

const bounds = { minLng: -46.7, minLat: -23.6, maxLng: -46.6, maxLat: -23.5 };

describe('RouteBoundsService', () => {
  const query = jest.fn();
  const forFavorites = jest.fn();
  let service: RouteBoundsService;

  beforeEach(() => {
    query.mockReset().mockResolvedValue([bounds]);
    forFavorites.mockReset();
    service = new RouteBoundsService(
      { $queryRaw: query } as unknown as PrismaService,
      { forFavorites } as unknown as BusDirectionService,
    );
  });

  it('aggregates all distinct route shapes in PostGIS without serializing coordinates', async () => {
    expect(await service.getBounds('route-1')).toEqual(bounds);
    const [sql, ...parameters] = query.mock.calls[0];
    expect(sql.join(' ')).toContain('ST_Extent(shape.geom)');
    expect(sql.join(' ')).toContain('SELECT DISTINCT trip.shape_id');
    expect(sql.join(' ')).not.toContain('ST_AsGeoJSON');
    expect(parameters).toEqual(['route-1', true, []]);
    expect(forFavorites).not.toHaveBeenCalled();
  });

  it.each(['direction', 'line'])('uses only resolved shapes for a stable %s favorite', async (kind) => {
    const identity = {
      sourceAgency: 'sptrans', shortName: '001',
      originLatitude: -23.5, originLongitude: -46.6,
      viaLatitude: -23.51, viaLongitude: -46.61,
      destinationLatitude: -23.53, destinationLongitude: -46.63,
    };
    const directionCode = encodeBusDirectionFavorite(identity);
    if (!directionCode) throw new Error('Invalid favorite fixture');
    const code = kind === 'direction' ? directionCode : encodeBusLineFavorite(directionCode);
    if (!code) throw new Error('Invalid favorite fixture');
    forFavorites.mockResolvedValue([
      { shapeIds: ['outbound-1', 'outbound-2'] },
      { shapeIds: ['outbound-2', 'outbound-3'] },
    ]);
    expect(await service.getBounds(code)).toEqual(bounds);
    expect(forFavorites).toHaveBeenCalledWith([code]);
    expect(query.mock.calls[0].slice(1)).toEqual([
      code, false, ['outbound-1', 'outbound-2', 'outbound-3'],
    ]);
  });

  it('returns null for missing or empty geometry', async () => {
    query.mockResolvedValue([{ minLng: null, minLat: null, maxLng: null, maxLat: null }]);
    expect(await service.getBounds('missing')).toBeNull();
  });

  it('does not query shapes when a saved direction no longer resolves', async () => {
    const code = encodeBusDirectionFavorite({
      sourceAgency: 'sptrans', shortName: '001',
      originLatitude: -23.5, originLongitude: -46.6,
      viaLatitude: -23.51, viaLongitude: -46.61,
      destinationLatitude: -23.53, destinationLongitude: -46.63,
    });
    if (!code) throw new Error('Invalid favorite fixture');
    forFavorites.mockResolvedValue([]);
    expect(await service.getBounds(code)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('shares concurrent bounds queries and caches their result', async () => {
    expect(await Promise.all([service.getBounds('route-1'), service.getBounds('route-1')]))
      .toEqual([bounds, bounds]);
    await service.getBounds('route-1');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('retries failed queries instead of caching errors', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.getBounds('route-1')).rejects.toThrow('database unavailable');
    expect(await service.getBounds('route-1')).toEqual(bounds);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
