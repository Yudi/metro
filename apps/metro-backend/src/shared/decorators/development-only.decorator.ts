import { ApiExcludeEndpoint, ApiOperation } from '@nestjs/swagger';

/**
 * Decorator that conditionally applies API documentation metadata based on the environment.
 *
 * - In production, it excludes the endpoint from API documentation.
 */
export const DevOnly = () =>
  process.env.NODE_ENV === 'production'
    ? ApiExcludeEndpoint()
    : ApiOperation({ summary: 'Dev-only endpoint' });
