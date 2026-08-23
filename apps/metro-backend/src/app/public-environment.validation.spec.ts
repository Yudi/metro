import { validatePublicEnvironment } from './public-environment.validation';

describe('validatePublicEnvironment', () => {
  it('accepts required configuration and typed optional dependencies', () => {
    expect(
      validatePublicEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@db:5432/metro',
        REDIS_URL: 'rediss://redis:6379',
        TYPESENSE_PROTOCOL: 'https',
        TYPESENSE_PORT: '443',
        RAIL_INTEGRATION_GRPC_URL: 'rail-private:50051',
      }),
    ).toMatchObject({
      NODE_ENV: 'production',
      TYPESENSE_PORT: '443',
    });
  });

  it.each([
    [{}, 'DATABASE_URL is required'],
    [
      { DATABASE_URL: 'http://db:5432/metro' },
      'DATABASE_URL must use postgres: or postgresql:',
    ],
    [
      {
        DATABASE_URL: 'postgresql://db/metro',
        RAIL_INTEGRATION_GRPC_URL: 'invalid target',
      },
      'RAIL_INTEGRATION_GRPC_URL must use host:port format',
    ],
  ])('rejects invalid startup configuration', (environment, message) => {
    expect(() => validatePublicEnvironment(environment)).toThrow(message);
  });
});
