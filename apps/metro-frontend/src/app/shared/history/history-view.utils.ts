import { HttpErrorResponse } from '@angular/common/http';
import { DEFAULT_TRANSIT_TIME_ZONE } from '@metro/shared/utils';

export type HistoryLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export function uniqueHistoryOptions(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
}

export function getHistoryTotalPages(
  itemCount: number,
  pageSize: number,
): number {
  return Math.max(1, Math.ceil(itemCount / pageSize));
}

export function sliceHistoryPage<T>(
  items: T[],
  currentPage: number,
  totalPages: number,
  pageSize: number,
): T[] {
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * pageSize;

  return items.slice(start, start + pageSize);
}

export function previousHistoryPage(page: number): number {
  return Math.max(1, page - 1);
}

export function nextHistoryPage(page: number, totalPages: number): number {
  return Math.min(totalPages, page + 1);
}

export function formatTransitDateTime(
  value: string,
  options: { assumeTransitOffset?: boolean } = {},
): string {
  const normalizedValue =
    options.assumeTransitOffset && !value.includes('Z')
      ? `${value.replace(/\.\d+$/, '')}-03:00`
      : value;
  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DEFAULT_TRANSIT_TIME_ZONE,
  }).format(date);
}

export function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function describeHistoryError(
  error: unknown,
  messages: {
    unexpected: string;
    backendDown: string;
    serverError: string;
    fallback: (status: number) => string;
    badRequest?: string | ((error: HttpErrorResponse) => string);
  },
): string {
  if (!(error instanceof HttpErrorResponse)) {
    return messages.unexpected;
  }

  if (error.status === 0) {
    return messages.backendDown;
  }

  if (error.status === 400 && messages.badRequest) {
    return typeof messages.badRequest === 'function'
      ? messages.badRequest(error)
      : messages.badRequest;
  }

  if (error.status >= 500) {
    return messages.serverError;
  }

  return messages.fallback(error.status);
}
