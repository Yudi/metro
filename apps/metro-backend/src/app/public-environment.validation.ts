export interface PublicEnvironment {
  NODE_ENV?: 'development' | 'test' | 'production';
  PORT?: string | number;
  DATABASE_URL: string;
  REDIS_URL?: string;
  TYPESENSE_HOST?: string;
  TYPESENSE_PORT?: string | number;
  TYPESENSE_PROTOCOL?: 'http' | 'https';
  RAIL_INTEGRATION_GRPC_URL?: string;
  ALLOWED_ORIGINS?: string;
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  [key: string]: unknown;
}

export function validatePublicEnvironment(
  input: Record<string, unknown>,
): PublicEnvironment {
  const environment = { ...input } as PublicEnvironment;
  environment.DATABASE_URL = requiredUrl(
    input['DATABASE_URL'],
    'DATABASE_URL',
    ['postgres:', 'postgresql:'],
  );

  const nodeEnvironment = optionalString(input['NODE_ENV']);
  if (
    nodeEnvironment &&
    !['development', 'test', 'production'].includes(nodeEnvironment)
  ) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  environment.NODE_ENV = nodeEnvironment as PublicEnvironment['NODE_ENV'];
  environment.PORT = optionalPort(input['PORT'], 'PORT');
  environment.TYPESENSE_PORT = optionalPort(
    input['TYPESENSE_PORT'],
    'TYPESENSE_PORT',
  );

  const redisUrl = optionalString(input['REDIS_URL']);
  if (redisUrl) {
    environment.REDIS_URL = requiredUrl(redisUrl, 'REDIS_URL', [
      'redis:',
      'rediss:',
    ]);
  }

  const typesenseProtocol = optionalString(input['TYPESENSE_PROTOCOL']);
  if (typesenseProtocol && !['http', 'https'].includes(typesenseProtocol)) {
    throw new Error('TYPESENSE_PROTOCOL must be http or https');
  }
  environment.TYPESENSE_PROTOCOL =
    typesenseProtocol as PublicEnvironment['TYPESENSE_PROTOCOL'];

  const grpcTarget = optionalString(input['RAIL_INTEGRATION_GRPC_URL']);
  if (grpcTarget && !/^[A-Za-z0-9._-]+:\d{1,5}$/.test(grpcTarget)) {
    throw new Error('RAIL_INTEGRATION_GRPC_URL must use host:port format');
  }
  environment.RAIL_INTEGRATION_GRPC_URL = grpcTarget;

  const s3Configuration = {
    endpoint: optionalString(input['S3_ENDPOINT']),
    bucket: optionalString(input['S3_BUCKET']),
    region: optionalString(input['S3_REGION']),
    accessKeyId: optionalString(input['S3_ACCESS_KEY_ID']),
    secretAccessKey: optionalString(
      input['S3_SECRET_ACCESS_KEY'],
    ),
  };
  const s3Configured = Object.values(s3Configuration).some(Boolean);
  if (s3Configured) {
    if (
      !s3Configuration.endpoint ||
      !s3Configuration.bucket ||
      !s3Configuration.accessKeyId ||
      !s3Configuration.secretAccessKey
    ) {
      throw new Error(
        'Configure S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY together.',
      );
    }

    const endpoint = parseS3Endpoint(s3Configuration.endpoint);
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(s3Configuration.bucket)) {
      throw new Error('S3_BUCKET must be a valid S3 bucket name');
    }
    if (
      s3Configuration.region &&
      !/^[a-z0-9-]{2,32}$/.test(s3Configuration.region)
    ) {
      throw new Error('S3_REGION must be a valid region name');
    }
    if (
      hasWhitespaceOrControl(s3Configuration.accessKeyId) ||
      hasWhitespaceOrControl(s3Configuration.secretAccessKey)
    ) {
      throw new Error('S3 credentials must not contain whitespace');
    }

    environment.S3_ENDPOINT = endpoint;
    environment.S3_BUCKET = s3Configuration.bucket;
    environment.S3_REGION = s3Configuration.region ?? 'us-east-1';
    environment.S3_ACCESS_KEY_ID = s3Configuration.accessKeyId;
    environment.S3_SECRET_ACCESS_KEY = s3Configuration.secretAccessKey;
  }

  const vapidPublic = optionalString(input['VAPID_PUBLIC_KEY']);
  const vapidPrivate = optionalString(input['VAPID_PRIVATE_KEY']);
  const vapidSubject = optionalString(input['VAPID_SUBJECT']);
  if (vapidPublic || vapidPrivate || vapidSubject) {
    if (
      !vapidPublic ||
      !vapidPrivate ||
      !vapidSubject ||
      !/^[A-Za-z0-9_-]{87}$/.test(vapidPublic) ||
      !/^[A-Za-z0-9_-]{43}$/.test(vapidPrivate) ||
      !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(vapidSubject)
    ) {
      throw new Error(
        'Configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT together with valid Web Push keys and a mailto: or HTTPS contact.',
      );
    }
    environment.VAPID_PUBLIC_KEY = vapidPublic;
    environment.VAPID_PRIVATE_KEY = vapidPrivate;
    environment.VAPID_SUBJECT = vapidSubject;
  }

  const allowedOrigins = optionalString(input['ALLOWED_ORIGINS']);
  if (allowedOrigins) {
    environment.ALLOWED_ORIGINS =
      validateAllowedOrigins(allowedOrigins).join(',');
  }

  return environment;
}

export function validateAllowedOrigins(value: string): string[] {
  const origins = Array.from(
    new Set(
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  );

  if (origins.length === 0) {
    throw new Error('ALLOWED_ORIGINS must contain at least one origin');
  }

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error(
        'ALLOWED_ORIGINS cannot contain * when credentials are enabled',
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`ALLOWED_ORIGINS contains an invalid origin: ${origin}`);
    }

    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error(`ALLOWED_ORIGINS contains an invalid origin: ${origin}`);
    }
  }

  return origins;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function hasWhitespaceOrControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const characterCode = character.charCodeAt(0);
    return (
      /\s/.test(character) || characterCode < 32 || characterCode === 127
    );
  });
}

function optionalPort(
  value: unknown,
  name: string,
): string | number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return typeof value === 'number' ? port : String(port);
}

function requiredUrl(
  value: unknown,
  name: string,
  protocols: string[],
): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} must use ${protocols.join(' or ')}`);
  }
  return normalized;
}

function parseS3Endpoint(value: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('S3_ENDPOINT must be a valid URL');
  }

  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    (endpoint.pathname !== '' && endpoint.pathname !== '/')
  ) {
    throw new Error(
      'S3_ENDPOINT must be an HTTP(S) origin without credentials, a path, query, or fragment',
    );
  }

  return endpoint.origin;
}
