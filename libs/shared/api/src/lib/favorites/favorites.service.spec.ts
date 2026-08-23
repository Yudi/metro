import { createEmptyFavorites } from '@metro/shared/utils';

jest.mock('@metro/shared/firebase', () => ({
  firebaseIdToken: jest.fn(() => null),
  firebaseUser: jest.fn(() => null),
}));

import {
  ANONYMOUS_FAVORITES_SCOPE,
  FavoriteOutboxRecord,
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
      operation({ operation: 'remove', type: 'railLine', code: 'L4', createdAt: 1 }),
      operation({ operation: 'add', type: 'railLine', code: 'L4', createdAt: 2 }),
    ]);
    const added = replayFavoriteOperations(server, [
      operation({ operation: 'add', type: 'railLine', code: 'L4', createdAt: 1 }),
      operation({ operation: 'remove', type: 'railLine', code: 'L4', createdAt: 2 }),
    ]);

    expect(removed.railLine).toEqual(['L4']);
    expect(added.railLine).toEqual([]);
  });
});
