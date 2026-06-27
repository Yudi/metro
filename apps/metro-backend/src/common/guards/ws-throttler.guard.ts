import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

/**
 * Custom ThrottlerGuard for WebSocket connections.
 * Extracts the client IP from the socket connection for rate limiting.
 */
@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler, blockDuration, generateKey } =
      requestProps;

    const client = context.switchToWs().getClient();
    // Get remote address from socket - works with socket.io
    const tracker =
      client._socket?.remoteAddress ||
      client.conn?.remoteAddress ||
      client.handshake?.address ||
      'unknown';

    const throttlerName = throttler.name ?? 'default';
    const key = generateKey(context, tracker, throttlerName);
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName
      );

    const getThrottlerSuffix = (name: string) =>
      name === 'default' ? '' : `-${name}`;

    // Set headers-like metadata on the client for debugging
    if (client.throttlerInfo === undefined) {
      client.throttlerInfo = {};
    }
    client.throttlerInfo[
      `X-RateLimit-Limit${getThrottlerSuffix(throttlerName)}`
    ] = limit;
    client.throttlerInfo[
      `X-RateLimit-Remaining${getThrottlerSuffix(throttlerName)}`
    ] = Math.max(0, limit - totalHits);
    client.throttlerInfo[
      `X-RateLimit-Reset${getThrottlerSuffix(throttlerName)}`
    ] = timeToExpire;

    // Throw an error when the user reached their limit
    if (isBlocked) {
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      });
    }

    return true;
  }
}
