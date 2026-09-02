import { Logger } from '@nestjs/common';

export const DEFAULT_SLOW_REQUEST_THRESHOLD_MS = 1_000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;
const OPERATION_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;
const HTTP_OPERATION_PATTERN = /^[A-Za-z0-9_./:-]{1,160}$/;

export interface TimingLogger {
  warn(message: string): void;
}

export interface TimingOptions {
  thresholdMs?: number;
  logger?: TimingLogger;
  now?: () => number;
}

export function createTimingLogger(name: string): TimingLogger {
  return new Logger(name);
}

export function getSlowRequestThresholdMs(
  configured = process.env.SLOW_REQUEST_THRESHOLD_MS,
): number {
  const threshold = Number(configured);
  return Number.isFinite(threshold) && threshold >= 0 && threshold <= 600_000
    ? threshold
    : DEFAULT_SLOW_REQUEST_THRESHOLD_MS;
}

export function safeRequestId(value: unknown): string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value)
    ? value
    : 'unknown';
}

export function safeOperationName(
  value: unknown,
  fallback = 'anonymous',
): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return typeof value === 'string' && OPERATION_NAME_PATTERN.test(value)
    ? value
    : 'invalid';
}

export function getHttpOperationName(request: {
  method: string;
  path?: string;
  route?: { path?: unknown };
}): string {
  const routePath = request.route?.path;
  if (typeof routePath === 'string') {
    const operation = `${request.method} ${routePath}`;
    if (HTTP_OPERATION_PATTERN.test(operation)) {
      return operation;
    }
  }

  // Keep a known GraphQL endpoint identifiable, but never include a raw URL
  // path that could contain coordinates or other user-provided segments.
  if (request.path === '/api/graphql') {
    return `${request.method} /api/graphql`;
  }

  return request.method;
}

export function elapsedMilliseconds(startedAt: number, now: () => number): number {
  return now() - startedAt;
}
