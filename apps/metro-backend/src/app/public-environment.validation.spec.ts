import { validatePublicEnvironment } from './public-environment.validation';

describe('validatePublicEnvironment', () => {
  it('requires complete optional Web Push configuration', () => {
    const base = { DATABASE_URL: 'postgresql://db/metro' };
    expect(() =>
      validatePublicEnvironment({ ...base, VAPID_PUBLIC_KEY: 'a'.repeat(87) }),
    ).toThrow('Configure VAPID');
    expect(
      validatePublicEnvironment({
        ...base,
        VAPID_PUBLIC_KEY: 'a'.repeat(87),
        VAPID_PRIVATE_KEY: 'b'.repeat(43),
        VAPID_SUBJECT: 'mailto:operations@example.com',
      }).VAPID_SUBJECT,
    ).toBe('mailto:operations@example.com');
  });
  it('accepts required configuration and typed optional dependencies', () => {
    expect(
      validatePublicEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@db:5432/metro',
        REDIS_URL: 'rediss://redis:6379',
        TYPESENSE_PROTOCOL: 'https',
        TYPESENSE_PORT: '443',
        RAIL_INTEGRATION_GRPC_URL: 'rail-private:50051',
        S3_ENDPOINT: 'https://s3.yudi.me',
        S3_BUCKET: 'metro',
        S3_ACCESS_KEY_ID: 'access-key',
        S3_SECRET_ACCESS_KEY: 'secret-key',
        ALLOWED_ORIGINS:
          ' https://metro.yudi.com.br,https://metro.yudi.com.br ',
      }),
    ).toMatchObject({
      NODE_ENV: 'production',
      TYPESENSE_PORT: '443',
      S3_REGION: 'us-east-1',
      ALLOWED_ORIGINS: 'https://metro.yudi.com.br',
    });
  });

  it('validates the optional S3 configuration as a complete group', () => {
    const base = { DATABASE_URL: 'postgresql://db/metro' };
    expect(
      validatePublicEnvironment({
        ...base,
        S3_ENDPOINT: 'https://s3.yudi.me/',
        S3_BUCKET: 'metro',
        S3_ACCESS_KEY_ID: 'access-key',
        S3_SECRET_ACCESS_KEY: 'secret-key',
      }).S3_ENDPOINT,
    ).toBe('https://s3.yudi.me');
    expect(() =>
      validatePublicEnvironment({
        ...base,
        S3_ENDPOINT: 'https://s3.yudi.me',
      }),
    ).toThrow('Configure S3_ENDPOINT');
    expect(
      validatePublicEnvironment({
        ...base,
        NODE_ENV: 'production',
      }).NODE_ENV,
    ).toBe('production');
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
    [
      {
        DATABASE_URL: 'postgresql://db/metro',
        S3_ENDPOINT: 'https://s3.yudi.me/prefix',
        S3_BUCKET: 'metro',
        S3_ACCESS_KEY_ID: 'access-key',
        S3_SECRET_ACCESS_KEY: 'secret-key',
      },
      'S3_ENDPOINT must be an HTTP(S) origin',
    ],
  ])('rejects invalid startup configuration', (environment, message) => {
    expect(() => validatePublicEnvironment(environment)).toThrow(message);
  });
});
