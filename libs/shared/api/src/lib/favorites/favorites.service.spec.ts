import { signal } from '@angular/core';
import {
  createEmptyFavorites,
  encodeBusLineFavorite,
  encodeBusDirectionFavorite,
  FavoriteList,
} from '@metro/shared/utils';

jest.mock('@metro/shared/firebase', () => ({
  firebaseIdToken: jest.fn(() => null),
  firebaseUser: jest.fn(() => null),
}));

import {
  ANONYMOUS_FAVORITES_SCOPE,
  FavoriteOutboxRecord,
  FavoritesService,
  classifyFavoriteSyncError,
  getFavoritesScope,
  replayFavoriteOperations,
} from './favorites.service';

function createDirectionFavoriteCode(
  favorite: Parameters<typeof encodeBusDirectionFavorite>[0],
): string {
  const code = encodeBusDirectionFavorite(favorite);
  if (!code) {
    throw new Error('Test direction key was invalid');
  }
  return code;
}

function createBusLineFavoriteCode(directionCode: string): string {
  const code = encodeBusLineFavorite(directionCode);
  if (!code) {
    throw new Error('Test whole-line key was invalid');
  }
  return code;
}

function operation(
  value: Partial<FavoriteOutboxRecord> &
    Pick<FavoriteOutboxRecord, 'operation'>,
): FavoriteOutboxRecord {
  return {
    operationId: value.operationId ?? 'test-operation',
    scope: value.scope ?? getFavoritesScope('user-a'),
    createdAt: value.createdAt ?? 1,
    ...value,
  };
}

describe('favorites persistence contracts', () => {
  it('keeps anonymous data separate from every authenticated account', () => {
    expect(getFavoritesScope(undefined)).toBe(ANONYMOUS_FAVORITES_SCOPE);
    expect(getFavoritesScope('user-a')).toBe('user:user-a');
    expect(getFavoritesScope('user-b')).not.toBe(getFavoritesScope('user-a'));
  });

  it('replays a deletion operation over a stale server snapshot', () => {
    const server = createEmptyFavorites();
    server.railLine = ['L4'];

    const result = replayFavoriteOperations(server, [
      operation({ operation: 'remove', type: 'railLine', code: 'L4' }),
    ]);

    expect(result.railLine).toEqual([]);
  });

  it('replays local operations over a conflict snapshot without losing another device change', () => {
    const conflictSnapshot = createEmptyFavorites();
    conflictSnapshot.railLine = ['L1'];

    const result = replayFavoriteOperations(conflictSnapshot, [
      operation({ operation: 'add', type: 'railLine', code: 'L4' }),
    ]);

    expect(result.railLine).toEqual(['L1', 'L4']);
  });

  it('uses the last explicit operation for deterministic add/remove conflicts', () => {
    const server = createEmptyFavorites();
    server.railLine = ['L4'];

    const removed = replayFavoriteOperations(server, [
      operation({
        operation: 'remove',
        type: 'railLine',
        code: 'L4',
        createdAt: 1,
      }),
      operation({
        operation: 'add',
        type: 'railLine',
        code: 'L4',
        createdAt: 2,
      }),
    ]);
    const added = replayFavoriteOperations(server, [
      operation({
        operation: 'add',
        type: 'railLine',
        code: 'L4',
        createdAt: 1,
      }),
      operation({
        operation: 'remove',
        type: 'railLine',
        code: 'L4',
        createdAt: 2,
      }),
    ]);

    expect(removed.railLine).toEqual(['L4']);
    expect(added.railLine).toEqual([]);
  });

  it.each([
    [400, 'terminal'],
    [401, 'terminal'],
    [403, 'terminal'],
    [409, 'terminal'],
    [422, 'terminal'],
    [0, 'transient'],
    [408, 'transient'],
    [429, 'transient'],
    [500, 'transient'],
  ] as const)('classifies HTTP %s as %s', (status, kind) => {
    expect(classifyFavoriteSyncError({ status }).kind).toBe(kind);
  });

  it('treats malformed snapshots as terminal without retrying them', () => {
    expect(
      classifyFavoriteSyncError({ status: 400, error: 'invalid favorites' }),
    ).toEqual({ kind: 'terminal', reason: 'http-400' });
    expect(
      classifyFavoriteSyncError(new Error('invalid local payload')),
    ).toEqual({ kind: 'terminal', reason: 'unknown' });
  });

  it('rejects a 501st favorite before writing the favorite or outbox operation', async () => {
    const favoriteRecords = Array.from({ length: 500 }, (_, index) => ({
      key: `user:user-a:railLine:L${index}`,
      scope: 'user:user-a',
      type: 'railLine' as const,
      code: `L${index}`,
      updatedAt: index,
    }));
    const favorites = {
      get: jest.fn(async () => undefined),
      put: jest.fn(),
      where: jest.fn(() => ({
        equals: jest.fn(() => ({
          count: jest.fn(async () => favoriteRecords.length),
        })),
      })),
    };
    const outbox = { put: jest.fn() };
    const service = Object.create(FavoritesService.prototype) as unknown as {
      db: unknown;
      activeScope: string;
      _syncError: {
        (): string | null;
        set(value: string | null): void;
      };
      syncWithServer: jest.Mock;
      addFavoriteRecord(code: string, type: 'railLine'): Promise<void>;
    };
    service.db = {
      favorites,
      outbox,
      transaction: jest.fn(async (...args: unknown[]) => {
        const callback = args[args.length - 1] as () => Promise<unknown>;
        return callback();
      }),
    };
    service.activeScope = 'user:user-a';
    service._syncError = signal(null);
    service.syncWithServer = jest.fn();

    await service.addFavoriteRecord('L500', 'railLine');

    expect(favorites.put).not.toHaveBeenCalled();
    expect(outbox.put).not.toHaveBeenCalled();
    expect(service._syncError()).toBe(
      'Você já atingiu o limite de 500 favoritos.',
    );
    expect(service.syncWithServer).not.toHaveBeenCalled();
  });
});

describe('legacy bus-route favorite migration', () => {
  const legacyCode = '477A-10';
  const directionCode = (destinationLongitude: number) =>
    createDirectionFavoriteCode({
      sourceAgency: 'sptrans',
      shortName: legacyCode,
      originLatitude: -23.55,
      originLongitude: -46.63,
      viaLatitude: -23.555,
      viaLongitude: -46.625,
      destinationLatitude: -23.56,
      destinationLongitude,
    });

  function createHarness(
    initialFavorites: FavoriteOutboxRecord[] = [],
    favoriteRecords: Array<{
      key: string;
      scope: string;
      type: 'busRoute' | 'railLine';
      code: string;
      updatedAt: number;
    }> = [],
    afterRead?: () => void,
  ) {
    const favorites = new Map(favoriteRecords.map((record) => [record.key, record]));
    const operations = [...initialFavorites];
    const favoritesTable = {
      get: async (key: string) => favorites.get(key),
      put: async (record: (typeof favoriteRecords)[number]) => {
        favorites.set(record.key, record);
      },
      delete: async (key: string) => {
        favorites.delete(key);
      },
      where: (index: string) => ({
        equals: (value: string) => ({
          toArray: async () => {
            if (index !== 'scope') throw new Error(`Unexpected index ${index}`);
            afterRead?.();
            return [...favorites.values()].filter(
              (record) => record.scope === value,
            );
          },
        }),
      }),
    };
    const outboxTable = {
      where: (index: string) => ({
        equals: (value: string) => ({
          toArray: async () => {
            if (index !== 'scope') throw new Error(`Unexpected index ${index}`);
            return operations.filter((operation) => operation.scope === value);
          },
        }),
      }),
      bulkDelete: async (ids: string[]) => {
        for (let index = operations.length - 1; index >= 0; index -= 1) {
          if (ids.includes(operations[index].operationId)) {
            operations.splice(index, 1);
          }
        }
      },
      put: async (operation: FavoriteOutboxRecord) => {
        operations.push(operation);
      },
    };
    type Harness = {
      db: {
        favorites: typeof favoritesTable;
        outbox: typeof outboxTable;
        transaction: (...args: unknown[]) => Promise<unknown>;
      };
      activeScope: string;
      scopeGeneration: number;
      platformId: string;
      syncWithServer: jest.Mock;
      migrateBusRouteFavorite(
        code: string,
        directionCodes: string[],
      ): Promise<boolean>;
      preserveBusLineFavorite(code: string, directionCode: string): Promise<boolean>;
    };
    const service = Object.create(FavoritesService.prototype) as Harness;
    service.db = {
      favorites: favoritesTable,
      outbox: outboxTable,
      transaction: async (...args: unknown[]) => {
        const callback = args[args.length - 1] as () => Promise<unknown>;
        return callback();
      },
    };
    service.activeScope = 'user:user-a';
    service.scopeGeneration = 3;
    service.platformId = 'browser';
    service.syncWithServer = jest.fn();
    return { service, favorites, operations };
  }

  function favoriteRecord(
    scope: string,
    type: 'busRoute' | 'railLine',
    code: string,
  ) {
    return {
      key: `${scope}:${type}:${code}`,
      scope,
      type,
      code,
      updatedAt: 1,
    };
  }

  it('replaces a legacy route with missing directions and queues only the needed operations', async () => {
    const existingDirection = directionCode(-46.62);
    const missingDirection = directionCode(-46.61);
    const { service, favorites, operations } = createHarness([], [
      favoriteRecord('user:user-a', 'busRoute', legacyCode),
      favoriteRecord('user:user-a', 'busRoute', existingDirection),
      favoriteRecord('user:user-a', 'railLine', 'L4'),
      favoriteRecord('user:user-b', 'busRoute', '5511-10'),
    ]);

    await expect(
      service.migrateBusRouteFavorite(legacyCode, [
        existingDirection,
        missingDirection,
      ]),
    ).resolves.toBe(true);

    expect(favorites.has(`user:user-a:busRoute:${legacyCode}`)).toBe(false);
    expect(favorites.has(`user:user-a:busRoute:${existingDirection}`)).toBe(
      true,
    );
    expect(favorites.has(`user:user-a:busRoute:${missingDirection}`)).toBe(
      true,
    );
    expect(favorites.has('user:user-a:railLine:L4')).toBe(true);
    expect(favorites.has('user:user-b:busRoute:5511-10')).toBe(true);
    expect(
      operations.map(({ operation, code }) => [operation, code]),
    ).toEqual([
      ['remove', legacyCode],
      ['add', missingDirection],
    ]);
    expect(service.syncWithServer).toHaveBeenCalledTimes(1);

    await expect(
      service.migrateBusRouteFavorite(legacyCode, [
        existingDirection,
        missingDirection,
      ]),
    ).resolves.toBe(false);
    expect(operations).toHaveLength(2);
  });

  it('keeps the old favorite when expanding would exceed the favorites cap', async () => {
    const records: ReturnType<typeof favoriteRecord>[] = [
      favoriteRecord('user:user-a', 'busRoute', legacyCode),
    ];
    records.push(
      ...Array.from({ length: 499 }, (_, index) =>
        favoriteRecord('user:user-a', 'railLine', `L${index}`),
      ),
    );
    const { service, favorites, operations } = createHarness([], records);

    await expect(
      service.migrateBusRouteFavorite(legacyCode, [
        directionCode(-46.62),
        directionCode(-46.61),
      ]),
    ).resolves.toBe(false);

    expect(favorites.has(`user:user-a:busRoute:${legacyCode}`)).toBe(true);
    const anchor = directionCode(-46.62);
    const broadCode = createBusLineFavoriteCode(anchor);
    await expect(
      service.preserveBusLineFavorite(legacyCode, anchor),
    ).resolves.toBe(true);
    expect(favorites.has(`user:user-a:busRoute:${legacyCode}`)).toBe(false);
    expect(favorites.has(`user:user-a:busRoute:${broadCode}`)).toBe(true);
    expect(operations.map(({ operation, code }) => [operation, code])).toEqual([
      ['remove', legacyCode],
      ['add', broadCode],
    ]);
    expect(service.syncWithServer).toHaveBeenCalledTimes(1);
  });

  it('stores a single resolved direction as a stable whole-line favorite', async () => {
    const anchor = directionCode(-46.62);
    const broadCode = createBusLineFavoriteCode(anchor);
    const { service, favorites, operations } = createHarness([], [
      favoriteRecord('user:user-a', 'busRoute', legacyCode),
    ]);

    await expect(
      service.preserveBusLineFavorite(legacyCode, anchor),
    ).resolves.toBe(true);

    expect(favorites.has(`user:user-a:busRoute:${legacyCode}`)).toBe(false);
    expect(favorites.has(`user:user-a:busRoute:${broadCode}`)).toBe(true);
    expect(operations.map(({ operation, code }) => [operation, code])).toEqual([
      ['remove', legacyCode],
      ['add', broadCode],
    ]);
  });

  it('keeps the whole-line anchor immutable when current terminals move', async () => {
    const broadCode = createBusLineFavoriteCode(directionCode(-46.62));
    const { service, favorites, operations } = createHarness([], [
      favoriteRecord('user:user-a', 'busRoute', broadCode),
    ]);

    await expect(
      service.preserveBusLineFavorite(broadCode, directionCode(-46.621)),
    ).resolves.toBe(false);

    expect(favorites.has(`user:user-a:busRoute:${broadCode}`)).toBe(true);
    expect(operations).toHaveLength(0);
    expect(service.syncWithServer).not.toHaveBeenCalled();
  });

  it('expands the stable whole-line key when two directions become available', async () => {
    const firstDirection = directionCode(-46.62);
    const secondDirection = directionCode(-46.61);
    const broadCode = createBusLineFavoriteCode(firstDirection);
    const { service, favorites, operations } = createHarness([], [
      favoriteRecord('user:user-a', 'busRoute', broadCode),
    ]);

    await expect(
      service.migrateBusRouteFavorite(broadCode, [
        firstDirection,
        secondDirection,
      ]),
    ).resolves.toBe(true);

    expect(favorites.has(`user:user-a:busRoute:${broadCode}`)).toBe(false);
    expect(favorites.has(`user:user-a:busRoute:${firstDirection}`)).toBe(true);
    expect(favorites.has(`user:user-a:busRoute:${secondDirection}`)).toBe(true);
    expect(operations.map(({ operation, code }) => [operation, code])).toEqual([
      ['remove', broadCode],
      ['add', firstDirection],
      ['add', secondDirection],
    ]);
  });

  it('does not write if the favorites scope changes during lookup', async () => {
    const serviceHolder: {
      current?: ReturnType<typeof createHarness>['service'];
    } = {};
    const harness = createHarness(
      [],
      [favoriteRecord('user:user-a', 'busRoute', legacyCode)],
      () => {
        const current = serviceHolder.current;
        if (!current) throw new Error('Migration service was not initialized');
        current.activeScope = 'user:user-b';
        current.scopeGeneration += 1;
      },
    );
    const { service } = harness;
    serviceHolder.current = service;

    await expect(
      service.migrateBusRouteFavorite(legacyCode, [directionCode(-46.62)]),
    ).resolves.toBe(false);

    expect(harness.favorites.has(`user:user-a:busRoute:${legacyCode}`)).toBe(
      true,
    );
    expect(harness.operations).toHaveLength(0);
  });
});

describe('dashboard bus-direction selection migration', () => {
  it('expands old route selections while preserving unrelated and existing choices', async () => {
    const existingDirection = createDirectionFavoriteCode({
      sourceAgency: 'sptrans',
      shortName: '477A-10',
      originLatitude: -23.55,
      originLongitude: -46.63,
      viaLatitude: -23.555,
      viaLongitude: -46.625,
      destinationLatitude: -23.56,
      destinationLongitude: -46.62,
    });
    const newDirection = createDirectionFavoriteCode({
      sourceAgency: 'sptrans',
      shortName: '477A-10',
      originLatitude: -23.56,
      originLongitude: -46.62,
      viaLatitude: -23.555,
      viaLongitude: -46.625,
      destinationLatitude: -23.55,
      destinationLongitude: -46.63,
    });
    const selection = {
      key: 'user:user-a:busStopRoutes:stop-1',
      scope: 'user:user-a',
      values: ['477A-10', 'stale-route', existingDirection],
      updatedAt: 1,
    };
    const dashboardSelections = {
      get: jest.fn(async (key: string) =>
        key === selection.key ? selection : undefined,
      ),
      put: jest.fn(async (record: typeof selection) => {
        Object.assign(selection, record);
      }),
    };
    type MigrationHarness = {
      db: {
        dashboardSelections: typeof dashboardSelections;
        transaction: (...args: unknown[]) => Promise<unknown>;
      };
      activeScope: string;
      scopeGeneration: number;
      platformId: string;
      migrateDashboardBusStopRoutes(
        stopId: string,
        routes: Array<{ routeId: string; favoriteCode?: string }>,
      ): Promise<boolean>;
    };
    const service = Object.create(FavoritesService.prototype) as MigrationHarness;
    service.db = {
      dashboardSelections,
      transaction: async (...args: unknown[]) => {
        const callback = args[args.length - 1] as () => Promise<unknown>;
        return callback();
      },
    };
    service.activeScope = 'user:user-a';
    service.scopeGeneration = 1;
    service.platformId = 'browser';

    await expect(
      service.migrateDashboardBusStopRoutes('stop-1', [
        { routeId: '477A-10', favoriteCode: existingDirection },
        { routeId: '477A-10', favoriteCode: newDirection },
      ]),
    ).resolves.toBe(true);

    expect(selection.values).toEqual([
      'stale-route',
      existingDirection,
      newDirection,
    ]);
    expect(dashboardSelections.put).toHaveBeenCalledTimes(1);
  });

  it('migrates a route selection to the single direction currently serving its stop', async () => {
    const directionCode = createDirectionFavoriteCode({
      sourceAgency: 'sptrans',
      shortName: '477A-10',
      originLatitude: -23.55,
      originLongitude: -46.63,
      viaLatitude: -23.555,
      viaLongitude: -46.625,
      destinationLatitude: -23.56,
      destinationLongitude: -46.62,
    });
    const selection = {
      key: 'user:user-a:busStopRoutes:stop-1',
      scope: 'user:user-a',
      values: ['477A-10'],
      updatedAt: 1,
    };
    const dashboardSelections = {
      get: jest.fn(async () => selection),
      put: jest.fn(async (record: typeof selection) => {
        Object.assign(selection, record);
      }),
    };
    type MigrationHarness = {
      db: {
        dashboardSelections: typeof dashboardSelections;
        transaction: (...args: unknown[]) => Promise<unknown>;
      };
      activeScope: string;
      scopeGeneration: number;
      platformId: string;
      migrateDashboardBusStopRoutes(
        stopId: string,
        routes: Array<{ routeId: string; favoriteCode?: string }>,
      ): Promise<boolean>;
    };
    const service = Object.create(FavoritesService.prototype) as MigrationHarness;
    service.db = {
      dashboardSelections,
      transaction: async (...args: unknown[]) => {
        const callback = args[args.length - 1] as () => Promise<unknown>;
        return callback();
      },
    };
    service.activeScope = 'user:user-a';
    service.scopeGeneration = 1;
    service.platformId = 'browser';

    await expect(
      service.migrateDashboardBusStopRoutes('stop-1', [
        { routeId: '477A-10', favoriteCode: directionCode },
      ]),
    ).resolves.toBe(true);

    expect(selection.values).toEqual([directionCode]);
  });

  it('leaves default and explicitly empty selections unchanged', async () => {
    const emptySelection = {
      key: 'user:user-a:busStopRoutes:stop-2',
      scope: 'user:user-a',
      values: [] as string[],
      updatedAt: 1,
    };
    const dashboardSelections = {
      get: jest.fn(async (key: string) =>
        key === emptySelection.key ? emptySelection : undefined,
      ),
      put: jest.fn(),
    };
    type MigrationHarness = {
      db: {
        dashboardSelections: typeof dashboardSelections;
        transaction: (...args: unknown[]) => Promise<unknown>;
      };
      activeScope: string;
      scopeGeneration: number;
      platformId: string;
      migrateDashboardBusStopRoutes(
        stopId: string,
        routes: Array<{ routeId: string; favoriteCode?: string }>,
      ): Promise<boolean>;
    };
    const service = Object.create(FavoritesService.prototype) as MigrationHarness;
    service.db = {
      dashboardSelections,
      transaction: async (...args: unknown[]) => {
        const callback = args[args.length - 1] as () => Promise<unknown>;
        return callback();
      },
    };
    service.activeScope = 'user:user-a';
    service.scopeGeneration = 1;
    service.platformId = 'browser';

    const route = { routeId: '477A-10', favoriteCode: 'bus:v1:valid' };
    await expect(
      service.migrateDashboardBusStopRoutes('missing-stop', [route]),
    ).resolves.toBe(false);
    await expect(
      service.migrateDashboardBusStopRoutes('stop-2', [route]),
    ).resolves.toBe(false);
    expect(dashboardSelections.put).not.toHaveBeenCalled();
  });

  it('copies an original stop selection to the canonical stop and keeps the alias record', async () => {
    const directionCodes = [
      createDirectionFavoriteCode({
        sourceAgency: 'sptrans',
        shortName: '477A-10',
        originLatitude: -23.55,
        originLongitude: -46.63,
        viaLatitude: -23.555,
        viaLongitude: -46.625,
        destinationLatitude: -23.56,
        destinationLongitude: -46.62,
      }),
      createDirectionFavoriteCode({
        sourceAgency: 'sptrans',
        shortName: '477A-10',
        originLatitude: -23.56,
        originLongitude: -46.62,
        viaLatitude: -23.555,
        viaLongitude: -46.625,
        destinationLatitude: -23.55,
        destinationLongitude: -46.63,
      }),
    ];
    const aliasRecord = {
      key: 'user:user-a:busStopRoutes:old-stop',
      scope: 'user:user-a',
      values: ['477A-10', 'stale-route'],
      updatedAt: 1,
    };
    const records = new Map([[aliasRecord.key, aliasRecord]]);
    const dashboardSelections = {
      get: jest.fn(async (key: string) => records.get(key)),
      put: jest.fn(async (record: typeof aliasRecord) => {
        records.set(record.key, record);
      }),
    };
    type MigrationHarness = {
      db: {
        dashboardSelections: typeof dashboardSelections;
        transaction: (...args: unknown[]) => Promise<unknown>;
      };
      activeScope: string;
      scopeGeneration: number;
      platformId: string;
      migrateDashboardBusStopRoutes(
        stopId: string,
        routes: Array<{ routeId: string; favoriteCode?: string }>,
        sourceStopIds?: string[],
      ): Promise<boolean>;
    };
    const service = Object.create(FavoritesService.prototype) as MigrationHarness;
    service.db = {
      dashboardSelections,
      transaction: async (...args: unknown[]) => {
        const callback = args[args.length - 1] as () => Promise<unknown>;
        return callback();
      },
    };
    service.activeScope = 'user:user-a';
    service.scopeGeneration = 1;
    service.platformId = 'browser';

    await expect(
      service.migrateDashboardBusStopRoutes(
        'new-stop',
        directionCodes.map((favoriteCode) => ({
          routeId: '477A-10',
          favoriteCode,
        })),
        ['old-stop'],
      ),
    ).resolves.toBe(true);

    expect(records.get('user:user-a:busStopRoutes:old-stop')?.values).toEqual([
      'stale-route',
      ...directionCodes,
    ]);
    expect(records.get('user:user-a:busStopRoutes:new-stop')?.values).toEqual([
      'stale-route',
      ...directionCodes,
    ]);
  });
});

describe('anonymous favorites first-login import', () => {
  const scope = getFavoritesScope('user-a');
  const anonymousFavorites = {
    ...createEmptyFavorites(),
    railLine: ['L4'],
    railStation: ['PIN'],
  };

  function createHarness() {
    let accountFavorites: Array<{
      key: string;
      scope: string;
      type: 'railLine' | 'railStation';
      code: string;
      updatedAt: number;
    }> = [];
    let anonymousRecords = [
      {
        key: 'anonymous:railLine:L4',
        scope: ANONYMOUS_FAVORITES_SCOPE,
        type: 'railLine' as const,
        code: 'L4',
        updatedAt: 1,
      },
      {
        key: 'anonymous:railStation:PIN',
        scope: ANONYMOUS_FAVORITES_SCOPE,
        type: 'railStation' as const,
        code: 'PIN',
        updatedAt: 1,
      },
    ];
    let operations: FavoriteOutboxRecord[] = [];
    const importedScopes = new Set<string>();
    const favorites = {
      where: () => ({
        equals: (recordScope: string) => ({
          toArray: async () =>
            recordScope === ANONYMOUS_FAVORITES_SCOPE
              ? anonymousRecords
              : accountFavorites,
          delete: async () => {
            if (recordScope === ANONYMOUS_FAVORITES_SCOPE) {
              anonymousRecords = [];
            }
          },
        }),
      }),
    };
    const outbox = {
      where: () => ({
        equals: (recordScope: string) => ({
          toArray: async () =>
            operations.filter((operation) => operation.scope === recordScope),
        }),
      }),
      put: async (operation: FavoriteOutboxRecord) => {
        operations.push(operation);
      },
      bulkDelete: async (ids: string[]) => {
        operations = operations.filter(
          (operation) => !ids.includes(operation.operationId),
        );
      },
    };
    const service = Object.create(FavoritesService.prototype) as {
      db: unknown;
      activeScope: string;
      scopeGeneration: number;
      retryAttempt: number;
      _syncError: ReturnType<typeof signal<string | null>>;
      _anonymousFavoritesImportCount: ReturnType<typeof signal<number | null>>;
      anonymousImportApprovedScope: string | null;
      anonymousFavoritesImportCount: () => number | null;
      importAnonymousFavorites(): Promise<void>;
      discardAnonymousFavorites(): Promise<void>;
      syncWithServer: jest.Mock;
      postGraphql: jest.Mock;
      replaceScopeFavorites: jest.Mock;
      syncScope(scope: string, generation: number): Promise<void>;
    };
    service.db = {
      favorites,
      outbox,
      anonymousFavoritesImports: {
        get: async (recordScope: string) =>
          importedScopes.has(recordScope) ? { scope: recordScope } : undefined,
        put: async ({ scope: recordScope }: { scope: string }) => {
          importedScopes.add(recordScope);
        },
      },
      transaction: async (...args: unknown[]) =>
        (args[args.length - 1] as () => Promise<unknown>)(),
    };
    service.activeScope = scope;
    service.scopeGeneration = 0;
    service.retryAttempt = 0;
    service._syncError = signal<string | null>(null);
    service._anonymousFavoritesImportCount = signal<number | null>(null);
    service.anonymousFavoritesImportCount =
      service._anonymousFavoritesImportCount;
    service.anonymousImportApprovedScope = null;
    service.syncWithServer = jest.fn();
    service.postGraphql = jest.fn();
    service.replaceScopeFavorites = jest.fn(
      async (_scope: string, favorites: FavoriteList) => {
        accountFavorites = favorites.railLine.map((code) => ({
          key: `${scope}:railLine:${code}`,
          scope,
          type: 'railLine' as const,
          code,
          updatedAt: 1,
        }));
      },
    );

    return {
      service,
      clearAccountFavorites: () => {
        accountFavorites = [];
      },
      importedScopes,
      operations: () => operations,
      anonymousRecords: () => anonymousRecords,
    };
  }

  it('waits for confirmation before uploading anonymous favorites', async () => {
    const { service, importedScopes, operations } = createHarness();
    service.postGraphql.mockResolvedValueOnce({
      userFavoritesSnapshot: {
        revision: 0,
        favorites: createEmptyFavorites(),
      },
    });

    await service.syncScope(scope, 0);

    expect(service.postGraphql).toHaveBeenCalledTimes(1);
    expect(service.anonymousFavoritesImportCount()).toBe(2);
    expect(importedScopes).not.toContain(scope);
    expect(operations()).toEqual([]);
  });

  it('does not approve an import without a pending consent request', async () => {
    const { service, anonymousRecords, operations } = createHarness();

    await service.importAnonymousFavorites();
    await service.discardAnonymousFavorites();

    expect(service.anonymousImportApprovedScope).toBeNull();
    expect(service.syncWithServer).not.toHaveBeenCalled();
    expect(anonymousRecords()).toHaveLength(2);
    expect(operations()).toEqual([]);
  });

  it('discards browser favorites without uploading them', async () => {
    const { service, anonymousRecords, importedScopes, operations } =
      createHarness();
    service._anonymousFavoritesImportCount.set(2);

    await service.discardAnonymousFavorites();

    expect(anonymousRecords()).toEqual([]);
    expect(importedScopes).toContain(scope);
    expect(service.anonymousFavoritesImportCount()).toBeNull();
    expect(service.postGraphql).not.toHaveBeenCalled();
    expect(operations()).toEqual([]);
  });

  it('does not reuse one account approval for another account', async () => {
    const { service, anonymousRecords, operations } = createHarness();
    service.anonymousImportApprovedScope = scope;
    const otherScope = getFavoritesScope('user-b');
    service.activeScope = otherScope;
    service.scopeGeneration = 1;
    service.postGraphql.mockResolvedValueOnce({
      userFavoritesSnapshot: { revision: 0, favorites: createEmptyFavorites() },
    });

    await service.syncScope(otherScope, 1);

    expect(service.anonymousFavoritesImportCount()).toBe(2);
    expect(service.postGraphql).toHaveBeenCalledTimes(1);
    expect(anonymousRecords()).toHaveLength(2);
    expect(operations()).toEqual([]);
  });

  it('imports and consumes anonymous favorites after explicit confirmation', async () => {
    const { service, importedScopes, operations, anonymousRecords } =
      createHarness();
    service.postGraphql.mockResolvedValueOnce({
      userFavoritesSnapshot: {
        revision: 0,
        favorites: createEmptyFavorites(),
      },
    });
    await service.syncScope(scope, 0);

    await service.importAnonymousFavorites();
    expect(service.syncWithServer).toHaveBeenCalledTimes(1);

    service.postGraphql
      .mockResolvedValueOnce({
        userFavoritesSnapshot: {
          revision: 0,
          favorites: createEmptyFavorites(),
        },
      })
      .mockResolvedValueOnce({
        syncFavorites: {
          success: true,
          revision: 1,
          favorites: anonymousFavorites,
        },
      });
    await service.syncScope(scope, 0);

    expect(service.postGraphql).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variables: { favorites: anonymousFavorites, expectedRevision: 0 },
      }),
    );
    expect(importedScopes).toContain(scope);
    expect(service.anonymousFavoritesImportCount()).toBeNull();
    expect(anonymousRecords()).toEqual([]);
    expect(operations()).toEqual([]);
  });
});

describe('failed favorite synchronization recovery', () => {
  function createHarness() {
    const scope = getFavoritesScope('user-a');
    let operations = [
      operation({
        operation: 'add',
        type: 'railLine',
        code: 'L4',
        status: 'pending',
      }),
    ];
    let localFavorites = { ...createEmptyFavorites(), railLine: ['L4'] };
    const service = Object.create(FavoritesService.prototype) as {
      db: unknown;
      activeScope: string;
      scopeGeneration: number;
      retryAttempt: number;
      _syncError: ReturnType<typeof signal<string | null>>;
      postGraphql: jest.Mock;
      prepareAnonymousFavoritesImport: jest.Mock;
      replaceScopeFavorites: jest.Mock;
      syncWithServer: jest.Mock;
      syncScope(scope: string, generation: number): Promise<void>;
      retryFailedFavoriteSync(): Promise<void>;
      discardFailedFavoriteSync(): Promise<void>;
    };
    function collection(predicate: (record: FavoriteOutboxRecord) => boolean) {
      return {
        toArray: async () => operations.filter(predicate),
        filter: (filter: (record: FavoriteOutboxRecord) => boolean) =>
          collection((record) => predicate(record) && filter(record)),
      };
    }
    service.db = {
      outbox: {
        where: () => ({
          equals: (value: string) =>
            collection((record) => record.scope === value),
        }),
        bulkPut: async (records: FavoriteOutboxRecord[]) => {
          for (const record of records) {
            operations = operations.filter(
              (item) => item.operationId !== record.operationId,
            );
            operations.push(record);
          }
        },
        bulkDelete: async (ids: string[]) => {
          operations = operations.filter(
            (record) => !ids.includes(record.operationId),
          );
        },
      },
      transaction: async (...args: unknown[]) =>
        (args[args.length - 1] as () => Promise<unknown>)(),
    };
    service.activeScope = scope;
    service.scopeGeneration = 0;
    service.retryAttempt = 0;
    service._syncError = signal<string | null>(null);
    service.postGraphql = jest.fn();
    service.prepareAnonymousFavoritesImport = jest.fn();
    service.syncWithServer = jest.fn();
    service.replaceScopeFavorites = jest.fn(
      async (_scope: string, favorites: FavoriteList) => {
        localFavorites = favorites;
      },
    );
    return {
      service,
      scope,
      operations: () => operations,
      favorites: () => localFavorites,
    };
  }

  it('keeps failed changes and restores their error on subsequent syncs', async () => {
    const { service, scope, operations, favorites } = createHarness();
    service.postGraphql.mockRejectedValueOnce({ status: 400 });
    await service.syncScope(scope, 0);
    expect(operations()[0].status).toBe('dead-letter');
    expect(service._syncError()).not.toBeNull();

    // A fresh service starts with no in-memory error; the durable outbox must
    // restore the decision state before fetching/replacing local favorites.
    service._syncError.set(null);
    service.postGraphql.mockClear();
    await service.syncScope(scope, 0);

    expect(service.postGraphql).not.toHaveBeenCalled();
    expect(service.replaceScopeFavorites).not.toHaveBeenCalled();
    expect(favorites().railLine).toEqual(['L4']);
    expect(service._syncError()).not.toBeNull();
    expect(operations()).toHaveLength(1);
  });

  it('replays failed intent only after an explicit retry', async () => {
    const { service, scope, operations, favorites } = createHarness();
    service.postGraphql.mockRejectedValueOnce({ status: 400 });
    await service.syncScope(scope, 0);
    await service.retryFailedFavoriteSync();
    expect(operations()[0].status).toBe('pending');
    expect(service.syncWithServer).toHaveBeenCalledTimes(1);

    const merged = { ...createEmptyFavorites(), railLine: ['L1', 'L4'] };
    service.postGraphql
      .mockResolvedValueOnce({
        userFavoritesSnapshot: {
          revision: 2,
          favorites: { ...createEmptyFavorites(), railLine: ['L1'] },
        },
      })
      .mockResolvedValueOnce({
        syncFavorites: {
          success: true,
          revision: 3,
          favorites: merged,
        },
      });
    await service.syncScope(scope, 0);

    expect(service.postGraphql).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variables: { favorites: merged, expectedRevision: 2 },
      }),
    );
    expect(favorites()).toEqual(merged);
    expect(operations()).toEqual([]);
    expect(service._syncError()).toBeNull();
  });

  it('refreshes from the server after failed intent is explicitly discarded', async () => {
    const { service, scope, operations, favorites } = createHarness();
    service.postGraphql.mockRejectedValueOnce({ status: 400 });
    await service.syncScope(scope, 0);
    await service.discardFailedFavoriteSync();
    expect(operations()).toEqual([]);
    expect(service.syncWithServer).toHaveBeenCalledTimes(1);

    service.postGraphql.mockResolvedValueOnce({
      userFavoritesSnapshot: {
        revision: 2,
        favorites: createEmptyFavorites(),
      },
    });
    await service.syncScope(scope, 0);

    expect(favorites()).toEqual(createEmptyFavorites());
    expect(service._syncError()).toBeNull();
  });
});
