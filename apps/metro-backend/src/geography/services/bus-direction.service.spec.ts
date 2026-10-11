import { encodeBusDirectionFavorite, encodeBusLineFavorite } from '@metro/shared/utils';
import { BusDirectionService } from './bus-direction.service';

const outboundStops = [
  { latitude: -23.55, longitude: -46.63, name: 'Terminal A' },
  { latitude: -23.56, longitude: -46.64, name: 'Via A' },
  { latitude: -23.57, longitude: -46.65, name: 'Via B' },
  { latitude: -23.59, longitude: -46.68, name: 'Terminal B' },
];

function row(direction = 0) {
  return {
    route_id: 'new-feed-id', route_short_name: '001', route_long_name: 'A - B',
    source_agency: 'sptrans', source_id: 'new-feed-id', route_type: 3,
    direction_id: direction, destination: direction ? 'Terminal A' : 'Terminal B',
    shape_ids: [direction ? 'inbound-shape' : 'outbound-shape'],
    stops: direction ? [...outboundStops].reverse() : outboundStops,
    serves_stop: true, fares: [{ price: 5, currency: 'BRL' }],
  };
}

function setup(rows = [row(), row(1)]) {
  const tx = { $executeRaw: jest.fn(), $queryRaw: jest.fn().mockResolvedValue(rows) };
  const prisma = { $transaction: jest.fn((read: (tx: unknown) => Promise<unknown>) => read(tx)) };
  return { service: new BusDirectionService(prisma as never), tx, prisma };
}

describe('BusDirectionService favorites', () => {
  it('coalesces identical route catalogs but partitions physical-stop directions', async () => {
    const { service, prisma } = setup();
    await Promise.all([
      service.forRoutes(['new-feed-id', 'other']),
      service.forRoutes(['other', 'new-feed-id', 'other']),
    ]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    await service.forRoutes(['other', 'new-feed-id']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    await service.forRoutes(['new-feed-id', 'other'], 'physical-stop');
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('reloads direction snapshots after their short TTL', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    try {
      const { service, prisma } = setup();
      await service.forRoutes(['new-feed-id']);
      now.mockReturnValue(30_000);
      await service.forRoutes(['new-feed-id']);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it('expands a legacy route into separately saved destinations and retains fares', async () => {
    const { service } = setup();
    const directions = await service.forFavorites(['new-feed-id']);
    expect(directions).toHaveLength(2);
    expect(new Set(directions.map((direction) => direction.favoriteCode)).size).toBe(2);
    expect(directions.map((direction) => direction.destination)).toEqual(['Terminal B', 'Terminal A']);
    expect(directions.every((direction) => direction.requestedCode === 'new-feed-id')).toBe(true);
    expect(directions[0].fares).toEqual([{ price: 5, currency: 'BRL' }]);
  });

  it('keeps the original saved key after IDs, names, direction IDs and coordinates change', async () => {
    const { service } = setup();
    const saved = (await service.forRoutes(['new-feed-id']))[0].favoriteCode;
    const changed = row(1);
    changed.stops = outboundStops.map((stop) => ({ ...stop, latitude: stop.latitude + 0.0002 }));
    changed.route_id = 'another-feed-id';
    changed.destination = 'Renamed Terminal B';
    const updated = setup([changed]);
    const result = await updated.service.forFavorites([saved]);
    expect(result).toEqual([expect.objectContaining({
      favoriteCode: saved, requestedCode: saved, routeId: 'another-feed-id',
      directionId: 1, destination: 'Renamed Terminal B',
    })]);
  });

  it('resolves a whole-line anchor after feed IDs change and can later expand all directions', async () => {
    const original = setup([row()]);
    const direction = (await original.service.forRoutes(['new-feed-id']))[0];
    const lineCode = encodeBusLineFavorite(direction.favoriteCode);
    if (!lineCode) throw new Error('Invalid fixture');
    const outbound = { ...row(), route_id: 'changed-id', destination: 'Renamed Terminal B' };
    const inbound = { ...row(1), route_id: 'changed-id' };
    const resolved = await setup([outbound, inbound]).service.forFavorites([lineCode]);
    expect(resolved).toHaveLength(2);
    expect(resolved.every((value) => value.requestedCode === lineCode && value.routeId === 'changed-id')).toBe(true);
    expect(new Set(resolved.map((value) => value.favoriteCode)).size).toBe(2);
  });

  it('retains ambiguous favorites as unresolved and does not pick a competing route', async () => {
    const { service } = setup();
    const saved = (await service.forRoutes(['new-feed-id']))[0].favoriteCode;
    const competing = row();
    competing.route_id = 'competing-id';
    competing.stops = competing.stops.map((stop) => ({ ...stop, latitude: stop.latitude + 0.0003 }));
    expect(await setup([row(), competing]).service.forFavorites([saved])).toEqual([]);
  });

  it('deduplicates patterns with the same snapshot and combines their map shapes', async () => {
    const variant = { ...row(), shape_ids: ['variant-shape'] };
    const { service, tx } = setup([row(), variant]);
    const result = await service.forRoutes(['new-feed-id']);
    expect(result).toHaveLength(1);
    expect(result[0].shapeIds).toEqual(['outbound-shape', 'variant-shape']);
    expect(tx.$executeRaw.mock.calls.map(([sql]) => sql.join(''))).toEqual([
      "SET LOCAL statement_timeout = '5s'", 'SET LOCAL jit = off',
    ]);
  });

  it('does not query for an empty or malformed versioned favorite set', async () => {
    const { service, prisma } = setup();
    expect(await service.forFavorites([])).toEqual([]);
    expect(await service.forFavorites(['bus:v1:broken'])).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps both orientations when the feed supplies the same direction ID', async () => {
    const inbound = { ...row(1), direction_id: 0 };
    const result = await setup([row(), inbound]).service.forRoutes(['new-feed-id']);
    expect(result).toHaveLength(2);
    expect(result[0].favoriteCode).not.toEqual(result[1].favoriteCode);
    expect(encodeBusDirectionFavorite(result[0])).toBe(result[0].favoriteCode);
  });
});
