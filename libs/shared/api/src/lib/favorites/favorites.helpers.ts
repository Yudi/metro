import { createEmptyFavorites } from '@metro/shared/utils';
import type { FavoriteList, FavoriteTypes } from '@metro/shared/utils';
import type {
  FavoriteOutboxRecord,
  FavoriteSyncErrorInfo,
  FavoriteSyncErrorKind,
  DashboardFavoriteSelections,
} from './favorites.models';

// Anonymous favorites are copied to an empty account during its first
// successful sync. The import decision is retained per account so a later
// login cannot restore favorites the user deliberately removed.
export const ANONYMOUS_FAVORITES_SCOPE = 'anonymous';
export const FAVORITE_CODE_MAX_LENGTH = 128;
export const MAX_FAVORITES_PER_SCOPE = 500;

export const favoriteTypes: FavoriteTypes[] = [
  'bikeStation',
  'railStation',
  'railLine',
  'busStop',
  'busRoute',
];

export class FavoriteSyncFailure extends Error {
  constructor(
    readonly kind: FavoriteSyncErrorKind,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'FavoriteSyncFailure';
  }
}

export function classifyFavoriteSyncError(
  error: unknown,
): FavoriteSyncErrorInfo {
  if (error instanceof FavoriteSyncFailure) {
    return { kind: error.kind, reason: error.reason };
  }

  const status = readHttpStatus(error);
  if (
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status !== null && status >= 500)
  ) {
    return { kind: 'transient', reason: `http-${status ?? 'unknown'}` };
  }

  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 409 ||
    status === 422
  ) {
    return { kind: 'terminal', reason: `http-${status}` };
  }

  // Only explicitly recognized transport failures are retryable. Unknown
  // errors are terminal so malformed local records or an unexpected contract
  // cannot create an endless background loop.
  return { kind: 'terminal', reason: 'unknown' };
}

export function getFavoritesScope(userId: string | null | undefined): string {
  return userId ? `user:${userId}` : ANONYMOUS_FAVORITES_SCOPE;
}

export function getFavoriteKey(
  scope: string,
  type: FavoriteTypes,
  code: string,
): string {
  return `${scope}:${type}:${code}`;
}

export function getDashboardSelectionKey(
  scope: string,
  group: keyof DashboardFavoriteSelections,
  id: string,
): string {
  return `${scope}:${group}:${id}`;
}

function isValidFavoriteCode(code: string): boolean {
  if (code.length === 0 || code.length > FAVORITE_CODE_MAX_LENGTH) {
    return false;
  }

  return Array.from(code).every((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint > 0x1f && codePoint !== 0x7f;
  });
}

export function normalizeFavoriteCodeValue(code: unknown): string | null {
  if (typeof code !== 'string') {
    return null;
  }

  const normalized = code.trim();
  return isValidFavoriteCode(normalized) ? normalized : null;
}

export function normalizeFavoriteSnapshot(value: unknown): FavoriteList {
  const favorites = createEmptyFavorites();

  if (!value || typeof value !== 'object') {
    return favorites;
  }

  const rawFavorites = value as Partial<Record<FavoriteTypes, unknown>>;
  let total = 0;
  for (const type of favoriteTypes) {
    const codes = rawFavorites[type];
    if (Array.isArray(codes)) {
      const normalizedCodes = Array.from(
        new Set(
          codes.flatMap((code) => {
            const normalized = normalizeFavoriteCodeValue(code);
            return normalized ? [normalized] : [];
          }),
        ),
      );
      const available = Math.max(0, MAX_FAVORITES_PER_SCOPE - total);
      favorites[type] = normalizedCodes.slice(0, available);
      total += favorites[type].length;
    }
  }

  return favorites;
}

export function replayFavoriteOperations(
  favorites: FavoriteList,
  operations: FavoriteOutboxRecord[],
): FavoriteList {
  return operations.reduce((current, operation) => {
    if (operation.operation === 'replace') {
      return operation.favorites
        ? normalizeFavoriteSnapshot(operation.favorites)
        : current;
    }
    if (!operation.type || !operation.code) {
      return current;
    }

    const next = normalizeFavoriteSnapshot(current);
    if (operation.operation === 'add') {
      next[operation.type] = Array.from(
        new Set([...next[operation.type], operation.code]),
      );
    } else {
      next[operation.type] = next[operation.type].filter(
        (code) => code !== operation.code,
      );
    }
    return next;
  }, normalizeFavoriteSnapshot(favorites));
}

export function classifyGraphqlErrors(
  errors: readonly unknown[],
): FavoriteSyncErrorKind {
  const codes = errors.flatMap((error) => {
    if (!isRecord(error) || !isRecord(error['extensions'])) {
      return [];
    }
    const code = error['extensions']['code'];
    return typeof code === 'string' ? [code.toUpperCase()] : [];
  });

  if (
    codes.some((code) =>
      ['BAD_USER_INPUT', 'UNAUTHENTICATED', 'FORBIDDEN', 'CONFLICT'].includes(
        code,
      ),
    )
  ) {
    return 'terminal';
  }

  return 'transient';
}

function readHttpStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }

  const status = error['status'];
  if (typeof status === 'number' && Number.isInteger(status)) {
    return status;
  }

  const nested = error['error'];
  if (isRecord(nested)) {
    const nestedStatus = nested['status'];
    if (typeof nestedStatus === 'number' && Number.isInteger(nestedStatus)) {
      return nestedStatus;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
