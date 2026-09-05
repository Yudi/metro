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

  const allowedOrigins = optionalString(input['ALLOWED_ORIGINS']);
  if (allowedOrigins) {
    environment.ALLOWED_ORIGINS = validateAllowedOrigins(allowedOrigins).join(
      ',',
    );
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
