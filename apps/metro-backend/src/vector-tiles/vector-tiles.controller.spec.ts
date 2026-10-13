import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { VectorTilesService } from './vector-tiles.service';
import { RailVectorTileService } from './services/rail-vector-tile.service';
import { SubwayStationProcessorService } from './services/subway-station-processor.service';
import { VectorTilesController } from './vector-tiles.controller';

describe('VectorTilesController input validation', () => {
  const controller = new VectorTilesController(
    {} as never,
    {} as never,
    {} as never,
  );
  const parseCsv = (
    value: string | undefined,
    argumentName: string,
  ): string[] =>
    (
      controller as unknown as {
        parseCsv: (value: string | undefined, argumentName: string) => string[];
      }
    ).parseCsv(value, argumentName);
  const parseNearby = (
    lat: string | undefined,
    lon: string | undefined,
    radius: string | undefined,
  ) =>
    (
      controller as unknown as {
        parseNearby: (
          lat: string | undefined,
          lon: string | undefined,
          radius: string | undefined,
        ) => unknown;
      }
    ).parseNearby(lat, lon, radius);

  it('rejects empty CSV elements instead of silently broadening the query', () => {
    expect(() => parseCsv('route-1,,route-2', 'routeIds')).toThrow(
      BadRequestException,
    );
  });

  it('rejects partial or non-finite nearby filters', () => {
    expect(() => parseNearby('-23.5', undefined, '100')).toThrow(
      BadRequestException,
    );
    expect(() => parseNearby('NaN', '-46.6', '100')).toThrow(
      BadRequestException,
    );
    expect(() => parseNearby('-23.5', '-46.6', '0')).toThrow(
      BadRequestException,
    );
  });

  it('keeps valid nearby filters intact', () => {
    expect(parseNearby('-23.5', '-46.6', '100')).toEqual({
      latitude: -23.5,
      longitude: -46.6,
      radiusMeters: 100,
    });
  });
});

describe('VectorTilesController bike HTTP caching', () => {
  it('revalidates unchanged tiles and sends new bytes when availability changes', async () => {
    const getTile = jest.fn().mockResolvedValue(Buffer.from('snapshot-one'));
    const module = await Test.createTestingModule({
      controllers: [VectorTilesController],
      providers: [
        { provide: VectorTilesService, useValue: { getTile } },
        { provide: RailVectorTileService, useValue: {} },
        { provide: SubwayStationProcessorService, useValue: {} },
      ],
    }).compile();
    const app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    try {
      const url = `${await app.getUrl()}/tiles/bike-stations/12/1517/2324.pbf`;
      const initial = await fetch(url);
      expect(initial.status).toBe(200);
      expect(initial.headers.get('cache-control')).toBe('public, no-cache');
      expect(await initial.text()).toBe('snapshot-one');
      const etag = initial.headers.get('etag');
      if (!etag) throw new Error('Missing bike tile ETag');

      const unchanged = await fetch(url, { cache: 'no-cache', headers: { 'If-None-Match': etag } });
      expect(unchanged.status).toBe(304);
      expect(await unchanged.text()).toBe('');

      getTile.mockResolvedValue(Buffer.from('snapshot-two'));
      const changed = await fetch(url, { cache: 'no-cache', headers: { 'If-None-Match': etag } });
      expect(changed.status).toBe(200);
      expect(changed.headers.get('etag')).not.toBe(etag);
      expect(await changed.text()).toBe('snapshot-two');

      getTile.mockResolvedValue(null);
      const removed = await fetch(url, { cache: 'no-cache', headers: { 'If-None-Match': etag } });
      expect(removed.status).toBe(204);
      expect(await removed.text()).toBe('');
    } finally {
      await app.close();
    }
  });
});
