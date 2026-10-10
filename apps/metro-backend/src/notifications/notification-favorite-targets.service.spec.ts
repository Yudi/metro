import { BadRequestException } from '@nestjs/common';
import {
  HEADWAY_DEFAULT_ENABLED_LINES,
  getRailStationFavoriteKey,
  RAIL_LINES,
} from '@metro/shared/utils';
import { NotificationFavoriteTargetsService } from './notification-favorite-targets.service';

function setup() {
  const prisma = {
    favorite: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
    notificationTarget: {
      upsert: jest.fn(
        async ({ create }: { create: Record<string, unknown> }) => ({
          id: '11111111-1111-7111-8111-111111111111',
          ...create,
          available: true,
        }),
      ),
    },
  };
  return {
    service: new NotificationFavoriteTargetsService(prisma as never, { forFavorites: jest.fn().mockResolvedValue([]) } as never),
    prisma,
  };
}

describe('NotificationFavoriteTargetsService', () => {
  it('rejects unknown target kinds before reading account favorites', async () => {
    const { service, prisma } = setup();

    await expect(
      service.getTargets('user-1', 'other' as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.favorite.findMany).not.toHaveBeenCalled();
  });

  it('resolves line favorites into opaque, persisted notification targets', async () => {
    const { service, prisma } = setup();
    prisma.favorite.findMany.mockResolvedValue([
      { code: 'L1' },
      { code: '4' },
      { code: 'unknown' },
    ]);

    const targets = await service.getTargets('user-1', 'rail_line');

    expect(targets).toEqual([
      expect.objectContaining({
        id: '11111111-1111-7111-8111-111111111111',
        kind: 'rail_line',
        label: expect.stringContaining('Linha 1'),
        railLineCode: 1,
      }),
      expect.objectContaining({ kind: 'rail_line', railLineCode: 4 }),
    ]);
    expect(prisma.favorite.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', type: 'railLine' },
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.notificationTarget.upsert).toHaveBeenCalledTimes(2);
  });

  it('expands a favorite station to its supported line targets', async () => {
    const { service, prisma } = setup();
    prisma.favorite.findMany.mockResolvedValue([
      { code: getRailStationFavoriteKey('Pinheiros') },
    ]);

    const targets = await service.getTargets('user-1', 'rail_station');

    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'rail_station',
          label: 'Pinheiros (Linha 9 - Esmeralda)',
          railLineCode: 9,
        }),
      ]),
    );
    const descriptor = prisma.notificationTarget.upsert.mock.calls.find(
      ([call]) =>
        (call.create.descriptor as { lineCode?: string }).lineCode === 'L9',
    )?.[0].create.descriptor as { stationCode: string } | undefined;
    expect(descriptor?.stationCode).toBeTruthy();
  });

  it('resolves only supported favorite route codes and keeps public route presentation', async () => {
    const { service, prisma } = setup();
    prisma.favorite.findMany.mockResolvedValue([{ code: 'route-1' }]);
    prisma.$queryRaw.mockResolvedValue([
      {
        name: '702P-10',
        label: 'Metrô Belém - Vila Industrial',
        color: '0066CC',
        textColor: 'FFFFFF',
      },
    ]);

    await expect(service.getTargets('user-1', 'bus_route')).resolves.toEqual([
      expect.objectContaining({
        kind: 'bus_route',
        label: '702P-10 (Metrô Belém - Vila Industrial)',
        busRouteShortName: '702P-10',
        busRouteColor: '0066CC',
        busRouteTextColor: 'FFFFFF',
      }),
    ]);
    expect(prisma.notificationTarget.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          descriptor: {
            routeName: '702P-10',
            agency: 'sptrans',
            presentation: {
              busRouteShortName: '702P-10',
              busRouteColor: '0066CC',
              busRouteTextColor: 'FFFFFF',
            },
          },
        }),
      }),
    );
  });

  it('uses the same server-owned identity descriptor for favorite bus stops as search', async () => {
    const { service, prisma } = setup();
    prisma.favorite.findMany.mockResolvedValue([{ code: 'stop-1' }]);
    prisma.$queryRaw.mockResolvedValue([
      {
        name: 'Praça da Sé',
        description: 'Plataforma A',
        latitude: -23.5505,
        longitude: -46.6333,
        platformCode: 'A',
      },
    ]);

    await expect(service.getTargets('user-1', 'bus_stop')).resolves.toEqual([
      expect.objectContaining({
        kind: 'bus_stop',
        label: 'Praça da Sé (-23.55050, -46.63330)',
      }),
    ]);
    expect(prisma.notificationTarget.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          descriptor: {
            name: 'Praça da Sé',
            description: 'Plataforma A',
            latitude: -23.5505,
            longitude: -46.6333,
            platformCode: 'A',
          },
        }),
      }),
    );
  });

  it('caps expanded station suggestions at twenty targets', async () => {
    const { service, prisma } = setup();
    const headwayLineCodes = new Set<string>(HEADWAY_DEFAULT_ENABLED_LINES);
    const stationCodes = RAIL_LINES.filter((line) =>
      headwayLineCodes.has(line.lineId),
    ).flatMap((line) =>
      line.stations.map((station) => getRailStationFavoriteKey(station.name)),
    );
    prisma.favorite.findMany.mockResolvedValue(
      [...new Set(stationCodes)].map((code) => ({ code })),
    );

    const targets = await service.getTargets('user-1', 'rail_station');

    expect(targets).toHaveLength(20);
  });
});
