import type { NextFunction, Request, Response } from 'express';
import {
  createTimingLogger,
  elapsedMilliseconds,
  getHttpOperationName,
  getSlowRequestThresholdMs,
  safeRequestId,
  TimingLogger,
  TimingOptions,
} from './timing.util';

export function createRequestTimingMiddleware(
  options: TimingOptions = {},
): (request: Request, response: Response, next: NextFunction) => void {
  const logger = options.logger ?? createTimingLogger('RequestTiming');
  const thresholdMs = options.thresholdMs ?? getSlowRequestThresholdMs();
  const now = options.now ?? (() => {
    const [seconds, nanoseconds] = process.hrtime();
    return seconds * 1_000 + nanoseconds / 1_000_000;
  });

  return (request, response, next) => {
    const startedAt = now();
    let recorded = false;

    const record = (aborted: boolean): void => {
      if (recorded) {
        return;
      }
      recorded = true;

      const durationMs = elapsedMilliseconds(startedAt, now);
      if (durationMs < thresholdMs) {
        return;
      }

      logger.warn(
        JSON.stringify({
          event: 'slow_request',
          operationName: getHttpOperationName(request),
          status: response.statusCode,
          outcome: aborted ? 'aborted' : 'completed',
          requestId: safeRequestId(request.headers['x-request-id']),
          durationMs: Math.round(durationMs * 100) / 100,
        }),
      );
    };

    response.once('finish', () => record(false));
    response.once('close', () => record(!response.writableEnded));
    next();
  };
}

export type { TimingLogger };
