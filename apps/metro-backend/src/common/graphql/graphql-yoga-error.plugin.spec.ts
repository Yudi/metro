import { HttpException, InternalServerErrorException } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { maskGraphQLError } from './graphql-yoga-error.plugin';

describe('GraphQL error statuses for administrative workflows', () => {
  it.each([
    [404, 'NOT_FOUND'], [409, 'CONFLICT'], [413, 'PAYLOAD_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'], [429, 'TOO_MANY_REQUESTS'],
  ])('preserves intentional client status %s as %s', (status, code) => {
    const result = maskGraphQLError(new GraphQLError('Operation failed', {
      originalError: new HttpException('Actionable client error', status),
    }));
    expect(result.extensions['code']).toBe(code);
    expect(result.message).toBe('Actionable client error');
  });

  it('keeps internal image/provider errors out of the GraphQL response', () => {
    const result = maskGraphQLError(new GraphQLError('Operation failed', {
      originalError: new InternalServerErrorException('Internal storage details'),
    }));
    expect(result.message).not.toContain('Internal storage details');
  });
});
