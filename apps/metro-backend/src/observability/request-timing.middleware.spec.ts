import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { createRequestTimingMiddleware } from './request-timing.middleware';

describe('request timing middleware', () => {
  it('logs only safe metadata for a slow request', () => {
    const logger = { warn: jest.fn() };
    const response = new EventEmitter() as EventEmitter &
      Pick<Response, 'statusCode' | 'writableEnded'>;
    response.statusCode = 200;
    const request = {
      method: 'GET',
      path: '/api/search/-23.55/-46.63',
      headers: { 'x-request-id': 'request-1234' },
    } as unknown as Request;
    let nowValue = 0;
    const middleware = createRequestTimingMiddleware({
      logger,
      thresholdMs: 10,
      now: () => nowValue,
    });

    middleware(request, response as unknown as Response, jest.fn() as NextFunction);
    nowValue = 20;
    response.emit('finish');

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const record = JSON.parse(logger.warn.mock.calls[0][0]) as Record<
      string,
      unknown
    >;
    expect(record).toMatchObject({
      event: 'slow_request',
      operationName: 'GET',
      status: 200,
      requestId: 'request-1234',
    });
    expect(String(record.durationMs)).toBe('20');
    expect(logger.warn.mock.calls[0][0]).not.toContain('-23.55');
    expect(logger.warn.mock.calls[0][0]).not.toContain('-46.63');
  });

  it('does not log a request below the configured threshold', () => {
    const logger = { warn: jest.fn() };
    const response = new EventEmitter() as EventEmitter &
      Pick<Response, 'statusCode' | 'writableEnded'>;
    response.statusCode = 204;
    const request = {
      method: 'GET',
      path: '/api/health',
      headers: { 'x-request-id': 'request-1234' },
    } as unknown as Request;
    let nowValue = 0;

    createRequestTimingMiddleware({
      logger,
      thresholdMs: 10,
      now: () => nowValue,
    })(request, response as unknown as Response, jest.fn() as NextFunction);
    nowValue = 9;
    response.emit('finish');

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
