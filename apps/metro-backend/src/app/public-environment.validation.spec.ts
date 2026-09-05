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
        ALLOWED_ORIGINS:
          ' https://metro.yudi.com.br,https://metro.yudi.com.br ',
      }),
    ).toMatchObject({
      NODE_ENV: 'production',
      TYPESENSE_PORT: '443',
      ALLOWED_ORIGINS: 'https://metro.yudi.com.br',
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
    [
      {
        DATABASE_URL: 'postgresql://db/metro',
        ALLOWED_ORIGINS: '*',
      },
      'ALLOWED_ORIGINS cannot contain * when credentials are enabled',
    ],
    [
      {
        DATABASE_URL: 'postgresql://db/metro',
        ALLOWED_ORIGINS: 'https://metro.yudi.com.br/path',
      },
      'ALLOWED_ORIGINS contains an invalid origin',
    ],
  ])('rejects invalid startup configuration', (environment, message) => {
    expect(() => validatePublicEnvironment(environment)).toThrow(message);
  });
});
