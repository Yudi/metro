import { signal } from '@angular/core';
import { createEmptyFavorites, FavoriteList } from '@metro/shared/utils';

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
    expect(classifyFavoriteSyncError(new Error('invalid local payload'))).toEqual(
      { kind: 'terminal', reason: 'unknown' },
    );
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
    expect(service._syncError()).toBe('Você já atingiu o limite de 500 favoritos.');
    expect(service.syncWithServer).not.toHaveBeenCalled();
  });
});

describe('failed favorite synchronization recovery', () => {
  function createHarness() {
    const scope = getFavoritesScope('user-a');
    let operations = [operation({
      operation: 'add', type: 'railLine', code: 'L4', status: 'pending',
    })];
    let localFavorites = { ...createEmptyFavorites(), railLine: ['L4'] };
    const service = Object.create(FavoritesService.prototype) as {
      db: unknown;
      activeScope: string;
      scopeGeneration: number;
      retryAttempt: number;
      _syncError: ReturnType<typeof signal<string | null>>;
      postGraphql: jest.Mock;
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
        where: () => ({ equals: (value: string) => collection((record) => record.scope === value) }),
        bulkPut: async (records: FavoriteOutboxRecord[]) => {
          for (const record of records) {
            operations = operations.filter((item) => item.operationId !== record.operationId);
            operations.push(record);
          }
        },
        bulkDelete: async (ids: string[]) => {
          operations = operations.filter((record) => !ids.includes(record.operationId));
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
    service.syncWithServer = jest.fn();
    service.replaceScopeFavorites = jest.fn(async (_scope: string, favorites: FavoriteList) => {
      localFavorites = favorites;
    });
    return {
      service, scope,
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
      .mockResolvedValueOnce({ userFavoritesSnapshot: {
        revision: 2, favorites: { ...createEmptyFavorites(), railLine: ['L1'] },
      } })
      .mockResolvedValueOnce({ syncFavorites: {
        success: true, revision: 3, favorites: merged,
      } });
    await service.syncScope(scope, 0);

    expect(service.postGraphql).toHaveBeenLastCalledWith(expect.objectContaining({
      variables: { favorites: merged, expectedRevision: 2 },
    }));
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

    service.postGraphql.mockResolvedValueOnce({ userFavoritesSnapshot: {
      revision: 2, favorites: createEmptyFavorites(),
    } });
    await service.syncScope(scope, 0);

    expect(favorites()).toEqual(createEmptyFavorites());
    expect(service._syncError()).toBeNull();
  });
});
