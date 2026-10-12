import type { BusTerminalRow } from './bus-terminal-catalog.utils';
import { BusTerminalService } from './bus-terminal.service';

const stop = (
  stopId: string,
  stopName: string,
  overrides: Partial<BusTerminalRow> = {},
): BusTerminalRow => ({
  stop_id: stopId,
  stop_name: stopName,
  stop_desc: null,
  stop_lat: -23.55,
  stop_lon: -46.63,
  source_agency: stopId.startsWith('artesp:') ? 'artesp' : 'sptrans',
  source_id: stopId.replace(/^artesp:/, ''),
  platform_code: null,
  ...overrides,
});

const routeRow = (routeId: string, sourceAgency: string) => ({
  route_id: routeId,
  agency_id: sourceAgency,
  route_short_name: '123',
  route_long_name: 'Terminal Parque Central - Terminal Jardim América',
  route_type: 3,
  route_color: '000000',
  route_text_color: 'ffffff',
  source_agency: sourceAgency,
  source_id: routeId.replace(/^artesp:/, ''),
});

const path = (reverse = false) => {
  const stops = [
    { latitude: -23.6, longitude: -46.7, name: 'Terminal Bairro' },
    { latitude: -23.58, longitude: -46.68, name: 'Parada intermediária' },
    { latitude: -23.55, longitude: -46.63, name: 'Terminal Parque Central' },
  ];
  return reverse ? stops.slice().reverse() : stops;
};

function createMockService(options?: {
  catalogRows?: BusTerminalRow[];
  stopRows?: Array<Record<string, unknown>>;
  directionRows?: Array<Record<string, unknown>>;
  patternView?: boolean;
  onCatalogQuery?: (call: number) => Promise<unknown> | unknown;
}) {
  const counts = { catalog: 0, aliases: 0, stops: 0, directions: 0, routeLinks: 0 };
  const transaction = {
    $executeRaw: jest.fn(async () => 1),
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('SELECT terminal.*')) {
        counts.catalog += 1;
        if (options?.onCatalogQuery) return options.onCatalogQuery(counts.catalog);
        return options?.catalogRows ?? [stop('platform-1', 'Terminal Parque Central')];
      }
      if (sql.includes('WITH candidate_patterns')) {
        counts.aliases += 1;
        return [];
      }
      if (sql.includes('physical_members.merged_stop_ids')) {
        counts.stops += 1;
        return options?.stopRows ?? [];
      }
      if (sql.includes('to_regclass')) return [{ available: options?.patternView ?? true }];
      if (sql.includes('pattern.served_stop_ids')) {
        counts.directions += 1;
        return (options?.directionRows ?? []).map((row) => {
          const points = row.stops as Array<{ latitude: number; longitude: number; name: string }>;
          return { ...row, stops: [points[0], points[Math.floor((points.length - 1) / 3)], points[points.length - 1]] };
        });
      }
      throw new Error(`Unexpected mocked query: ${sql}`);
    }),
  };
  const prisma = {
    $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
      Promise.resolve(callback(transaction)),
    ),
  };
  return {
    service: new BusTerminalService(prisma as never),
    counts,
  };
}

describe('BusTerminalService', () => {
  it('does not assign the Sacomã street stop or its passing-only routes to the terminal', async () => {
    const platform = stop('330016325', 'Terminal Sacomã - Plat. 3', {
      stop_lat: -23.602668,
      stop_lon: -46.602513,
    });
    const street = stop('330016296', 'Terminal Sacoma', {
      stop_desc: 'R. Silva Bueno, 2638 Ref.: R Lino Coutinho/ R Greenfeld',
      stop_lat: -23.601813,
      stop_lon: -46.601138,
    });
    const directionRows = ['476A-10', '477U-10', '574J-10', '5107-10'].map((routeId) => ({
      ...routeRow(routeId, 'sptrans'),
      direction_id: 0,
      trip_headsign: 'Destino',
      served_stop_ids: routeId === '5107-10' ? [street.stop_id, platform.stop_id] : [street.stop_id],
      stops: path(),
    }));
    const { service } = createMockService({
      catalogRows: [street, platform],
      stopRows: [{ ...platform }],
      directionRows,
    });

    expect(await service.getTerminalForStop(street.stop_id)).toBeNull();
    const detail = await service.getTerminal('terminal:terminal-sacoma');
    expect(detail?.stopIds).toEqual([platform.stop_id]);
    expect(detail?.routes.map((route) => route.routeId)).toEqual(['5107-10']);
  });

  it('caches the full catalog, returns stop membership, and resolves one terminal detail', async () => {
    const catalogRows = [
      stop('sptrans-platform-1', 'Terminal Parque Central - Pl. 1'),
      stop('sptrans-platform-2', 'Terminal Parque Central - Plat. 2', {
        stop_lat: -23.5502,
      }),
      stop('artesp:platform-3', 'Term. Parque Central - Plataforma 3', {
        stop_lat: -23.5503,
      }),
      stop('sptrans-alighting', 'Terminal Parque Central - Desembarque', {
        stop_lat: -23.5504,
      }),
    ];
    const stopRows = catalogRows.map((source) => ({
      ...source,
      merged_stop_ids: [source.stop_id],
    }));
    const outbound = {
      ...routeRow('sptrans:route-123', 'sptrans'),
      direction_id: 0,
      trip_headsign: 'Centro',
      served_stop_ids: ['sptrans-platform-1'],
      stops: path(),
    };
    const outboundOtherPlatform = {
      ...outbound,
      served_stop_ids: ['sptrans-platform-2'],
    };
    const inbound = {
      ...outbound,
      direction_id: 1,
      trip_headsign: 'Bairro',
      served_stop_ids: ['sptrans-platform-2'],
      stops: path(true),
    };
    const otherProvider = {
      ...routeRow('artesp:route-123', 'artesp'),
      direction_id: 0,
      trip_headsign: 'Centro',
      served_stop_ids: ['artesp:platform-3'],
      stops: path(),
    };
    const alightingOnlyDirection = {
      ...outbound,
      route_id: 'sptrans:alighting-only-route',
      served_stop_ids: ['sptrans-alighting'],
    };
    const { service, counts } = createMockService({
      catalogRows,
      stopRows,
      directionRows: [outbound, outboundOtherPlatform, inbound, otherProvider, alightingOnlyDirection],
    });

    const catalog = await service.getCatalog();
    expect(await service.getCatalog()).toEqual(catalog);
    expect(counts.catalog).toBe(1);
    expect(await service.getTerminalForStop('artesp:platform-3'))
      .toMatchObject({ id: catalog[0].id });
    expect(await service.getTerminalForStop('ordinary-nearby-stop')).toBeNull();

    const detail = await service.getTerminal(catalog[0].id);
    expect(detail?.stops).toHaveLength(4);
    expect(detail?.stops.find((item) => item.stopId === 'sptrans-alighting'))
      .toMatchObject({ boardingAllowed: false });
    expect(detail?.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        routeId: 'sptrans:route-123',
        directionId: 0,
        destination: 'Centro',
        stopIds: ['sptrans-platform-1', 'sptrans-platform-2'],
        favoriteCode: expect.stringMatching(/^bus:v1:/),
      }),
      expect.objectContaining({
        routeId: 'sptrans:route-123',
        directionId: 1,
        destination: 'Bairro',
        stopIds: ['sptrans-platform-2'],
      }),
      expect.objectContaining({
        routeId: 'artesp:route-123',
        sourceAgency: 'artesp',
        directionId: 0,
        stopIds: ['artesp:platform-3'],
      }),
    ]));
    expect(detail?.routes.some((route) =>
      route.routeId === 'sptrans:alighting-only-route',
    )).toBe(false);
    expect(counts.directions).toBe(1);
    expect(counts.routeLinks).toBe(0);
  });

  it.each([
    { trip_headsign: null, direction_id: 0 },
    { trip_headsign: 'Centro', direction_id: 0 },
    { trip_headsign: 'Terminal Parque Central', direction_id: 1 },
  ])('merges canonical directions despite differing metadata: %j', async (metadata) => {
    const catalogRows = [
      stop('platform-1', 'Terminal Parque Central - Pl. 1'),
      stop('platform-2', 'Terminal Parque Central - Pl. 2'),
    ];
    const pattern = {
      ...routeRow('sptrans:route-123', 'sptrans'),
      direction_id: 0,
      trip_headsign: 'Terminal Parque Central',
      served_stop_ids: ['platform-1'],
      stops: path(),
    };
    const { service } = createMockService({
      catalogRows,
      stopRows: catalogRows.map((source) => ({
        ...source,
        merged_stop_ids: [source.stop_id],
      })),
      directionRows: [pattern, {
        ...pattern,
        ...metadata,
        served_stop_ids: ['platform-1', 'platform-2'],
      }],
    });

    const summary = (await service.getCatalog())[0];
    const detail = await service.getTerminal(summary.id);

    expect(detail?.routes).toEqual([
      expect.objectContaining({
        routeId: 'sptrans:route-123',
        destination: 'Terminal Parque Central',
        directionId: 0,
        favoriteCode: expect.stringMatching(/^bus:v1:/),
        stopIds: ['platform-1', 'platform-2'],
      }),
    ]);
  });

  it('leaves unknown direction IDs unset and never fabricates a direction', async () => {
    const terminalRow = stop('platform', 'Terminal Central');
    const pattern = {
      ...routeRow('sptrans:unknown-direction', 'sptrans'),
      direction_id: null,
      trip_headsign: 'Centro',
      served_stop_ids: ['platform'],
      stops: path(),
    };
    const { service } = createMockService({
      catalogRows: [terminalRow],
      stopRows: [{ ...terminalRow, merged_stop_ids: ['platform'] }],
      directionRows: [pattern],
    });
    const summary = (await service.getCatalog())[0];
    const detail = await service.getTerminal(summary.id);

    expect(detail?.routes[0]).toMatchObject({ destination: 'Centro' });
    expect(detail?.routes[0]).not.toHaveProperty('directionId');
  });

  it('reports a missing precomputed index instead of scanning the timetable', async () => {
    const terminalRow = stop('platform', 'Terminal Central');
    const { service, counts } = createMockService({
      catalogRows: [terminalRow],
      stopRows: [{ ...terminalRow, merged_stop_ids: ['platform'] }],
      patternView: false,
    });
    const summary = (await service.getCatalog())[0];
    await expect(service.getTerminal(summary.id)).rejects.toThrow('database migration');
    expect(counts.directions).toBe(0);
    expect(counts.routeLinks).toBe(0);
  });

  it('refreshes a changed terminal snapshot before returning boarding points', async () => {
    const first = stop('one', 'Terminal Central - Pl. 1');
    const second = stop('two', 'Terminal Central - Pl. 2');
    const { service, counts } = createMockService({
      onCatalogQuery: (call) => call === 1 ? [first, second] : [first],
      stopRows: [{ ...first, merged_stop_ids: ['one'] }],
    });
    const summary = (await service.getCatalog())[0];
    const detail = await service.getTerminal(summary.id);
    expect(detail?.stopIds).toEqual(['one']);
    expect(detail?.stops.map((item) => item.stopId)).toEqual(['one']);
    expect(counts.catalog).toBe(2);
  });

  it('does not let an older in-flight catalog load repopulate after refresh succeeds', async () => {
    let rejectOld: ((error: Error) => void) | undefined;
    let oldLoadStarted = false;
    const newRows = [stop('new', 'Terminal Novo')];
    const { service } = createMockService({
      onCatalogQuery: (call) => {
        if (call === 1) {
          oldLoadStarted = true;
          return new Promise<BusTerminalRow[]>((_resolve, reject) => {
            rejectOld = reject;
          });
        }
        return newRows;
      },
    });

    const oldLoad = service.getCatalog();
    for (let attempts = 0; attempts < 8 && !oldLoadStarted; attempts += 1) {
      await Promise.resolve();
    }
    expect(oldLoadStarted).toBe(true);

    const refreshed = await service.refreshCatalog();
    expect(refreshed.map((terminal) => terminal.name)).toEqual(['Terminal Novo']);
    rejectOld?.(new Error('stale catalog query failed'));
    await expect(oldLoad).rejects.toThrow('stale catalog query failed');
    expect((await service.getCatalog()).map((terminal) => terminal.name))
      .toEqual(['Terminal Novo']);
  });

  it('does not retain the old catalog when refresh fails', async () => {
    let queryCount = 0;
    const oldRows = [stop('old', 'Terminal Antigo')];
    const nextRows = [stop('next', 'Terminal Atualizado')];
    const { service } = createMockService({
      onCatalogQuery: () => {
        queryCount += 1;
        if (queryCount === 1) return oldRows;
        if (queryCount === 2) throw new Error('catalog unavailable');
        return nextRows;
      },
    });

    expect((await service.getCatalog())[0].name).toBe('Terminal Antigo');
    await expect(service.refreshCatalog()).rejects.toThrow('catalog unavailable');
    expect((await service.getCatalog())[0].name).toBe('Terminal Atualizado');
    expect(queryCount).toBe(3);
  });
});
