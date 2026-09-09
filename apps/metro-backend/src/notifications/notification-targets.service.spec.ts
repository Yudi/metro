import { NotificationTargetsService } from './notification-targets.service';

function setup() {
  const prisma = {
    $queryRaw: jest.fn(),
    notificationTarget: {
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        id: '11111111-1111-7111-8111-111111111111',
        ...create,
        available: true,
      })),
    },
  };
  return {
    service: new NotificationTargetsService(prisma as never),
    prisma,
  };
}

describe('NotificationTargetsService', () => {
  it('only offers lines that have headway data support as station targets', async () => {
    const { service, prisma } = setup();

    await service.search('rail_station', 'Linha 1');

    const descriptors = prisma.notificationTarget.upsert.mock.calls.map(
      ([call]) => call.create.descriptor as { lineCode: string },
    );
    expect(descriptors.some((descriptor) => descriptor.lineCode === 'L1')).toBe(
      false,
    );
    expect(
      descriptors.every((descriptor) =>
        ['L4', 'L8', 'L9', 'L10', 'L11', 'L12', 'L13'].includes(
          descriptor.lineCode,
        ),
      ),
    ).toBe(true);
  });

  it('returns a public rail line number for station presentation', async () => {
    const { service } = setup();

    await expect(service.search('rail_station', 'Pinheiros')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'rail_station',
          label: 'Pinheiros · Linha 9 - Esmeralda',
          railLineCode: 9,
        }),
      ]),
    );
  });

  it('omits the special line that has no departure observations', async () => {
    const { service, prisma } = setup();

    await service.search('special_line', '');

    const descriptors = prisma.notificationTarget.upsert.mock.calls.map(
      ([call]) => call.create.descriptor,
    );
    expect(descriptors).toEqual([
      { code: 'EA' },
      { code: '10X' },
    ]);
  });

  it('stores catalog platform metadata as part of bus stop identity', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([
      {
        name: 'Praça da Sé',
        description: 'Plataforma A',
        latitude: -23.5505,
        longitude: -46.6333,
        platformCode: 'A',
      },
    ]);

    await service.search('bus_stop', 'Parada');

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

  it('projects bus route identity and colors without persisting presentation data', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([
      {
        name: '702P-10',
        label: 'Metrô Belém - Vila Industrial',
        color: '0066CC',
        textColor: 'FFFFFF',
      },
    ]);

    await expect(service.search('bus_route', '702P')).resolves.toEqual([
      expect.objectContaining({
        kind: 'bus_route',
        label: '702P-10 · Metrô Belém - Vila Industrial',
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
});
