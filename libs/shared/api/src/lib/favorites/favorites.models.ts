import type { FavoriteList, FavoriteTypes } from '@metro/shared/utils';

export type FavoriteOperation = 'add' | 'remove' | 'replace';
export type FavoriteOutboxStatus = 'pending' | 'dead-letter';

export interface FavoriteRecord {
  key: string;
  scope: string;
  type: FavoriteTypes;
  code: string;
  updatedAt: number;
}
export interface LegacyFavoriteRecord {
  key: string;
  type: FavoriteTypes;
  code: string;
  updatedAt: number;
  scope?: string;
}

export interface DashboardSelectionRecord {
  key: string;
  scope: string;
  values: string[];
  updatedAt: number;
}

export interface LegacyDashboardSelectionRecord {
  key: string;
  values: string[];
  updatedAt: number;
  scope?: string;
}

export interface AnonymousFavoritesImportRecord {
  scope: string;
  importedAt: number;
}

export interface FavoriteOutboxRecord {
  operationId: string;
  scope: string;
  status?: FavoriteOutboxStatus;
  attempts?: number;
  lastError?: string;
  operation: FavoriteOperation;
  type?: FavoriteTypes;
  code?: string;
  favorites?: FavoriteList;
  createdAt: number;
}

export type FavoriteSyncErrorKind = 'transient' | 'terminal';

export interface FavoriteSyncErrorInfo {
  kind: FavoriteSyncErrorKind;
  reason: string;
}
export interface GraphqlResponse<T> {
  data?: T;
  errors?: readonly unknown[];
}

export interface FavoriteSnapshotResult {
  revision?: number;
  favorites?: FavoriteList;
}

export interface FavoriteSyncResult extends FavoriteSnapshotResult {
  success?: boolean;
  conflict?: boolean;
  message?: string;
}

export interface UserFavoritesResult {
  userFavoritesSnapshot?: FavoriteSnapshotResult;
}

export interface FavoriteMutationResult {
  syncFavorites?: FavoriteSyncResult;
}

export interface DashboardFavoriteSelections {
  railStationLines: Record<string, string[]>;
  busStopRoutes: Record<string, string[]>;
}
