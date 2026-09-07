import Dexie, { Table } from 'dexie';
import {
  ANONYMOUS_FAVORITES_SCOPE,
  getDashboardSelectionKey,
  getFavoriteKey,
} from './favorites.helpers';
import type {
  AnonymousFavoritesImportRecord,
  DashboardFavoriteSelections,
  DashboardSelectionRecord,
  FavoriteOutboxRecord,
  FavoriteRecord,
  LegacyDashboardSelectionRecord,
  LegacyFavoriteRecord,
} from './favorites.models';

const FAVORITES_DATABASE_NAME = 'metro-favorites';

export class FavoritesDatabase extends Dexie {
  favorites!: Table<FavoriteRecord, string>;
  dashboardSelections!: Table<DashboardSelectionRecord, string>;
  outbox!: Table<FavoriteOutboxRecord, string>;
  anonymousFavoritesImports!: Table<AnonymousFavoritesImportRecord, string>;

  constructor() {
    super(FAVORITES_DATABASE_NAME);
    this.version(1).stores({
      favorites: '&key, type, code, updatedAt',
    });
    this.version(2).stores({
      favorites: '&key, type, code, updatedAt',
      dashboardSelections: '&key, updatedAt',
    });
    this.version(3)
      .stores({
        favorites: '&key, [scope+type], scope, type, code, updatedAt',
        dashboardSelections: '&key, scope, updatedAt',
        outbox: '&operationId, scope, operation, type, code, createdAt',
      })
      .upgrade(async (tx) => {
        const favoriteTable = tx.table('favorites');
        const oldFavorites =
          (await favoriteTable.toArray()) as LegacyFavoriteRecord[];
        await favoriteTable.clear();
        if (oldFavorites.length > 0) {
          await favoriteTable.bulkPut(
            oldFavorites.map((record) => ({
              ...record,
              scope: ANONYMOUS_FAVORITES_SCOPE,
              key: getFavoriteKey(
                ANONYMOUS_FAVORITES_SCOPE,
                record.type,
                record.code,
              ),
            })),
          );
        }

        const dashboardTable = tx.table('dashboardSelections');
        const oldDashboardSelections =
          (await dashboardTable.toArray()) as LegacyDashboardSelectionRecord[];
        await dashboardTable.clear();
        if (oldDashboardSelections.length > 0) {
          await dashboardTable.bulkPut(
            oldDashboardSelections.map((record) => {
              const separatorIndex = record.key.indexOf(':');
              const group = record.key.slice(
                0,
                separatorIndex,
              ) as keyof DashboardFavoriteSelections;
              const id = record.key.slice(separatorIndex + 1);
              const scope = ANONYMOUS_FAVORITES_SCOPE;
              return {
                ...record,
                scope,
                key: getDashboardSelectionKey(scope, group, id),
              };
            }),
          );
        }
      });
    this.version(4).stores({
      favorites: '&key, [scope+type], scope, type, code, updatedAt',
      dashboardSelections: '&key, scope, updatedAt',
      outbox: '&operationId, scope, operation, type, code, createdAt',
      anonymousFavoritesImports: '&scope, importedAt',
    });
  }
}
