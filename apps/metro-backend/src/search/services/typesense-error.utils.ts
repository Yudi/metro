function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function formatErrorValue(value: unknown, fallback: string): string {
  if (typeof value === 'number' || typeof value === 'string') {
    return String(value).slice(0, 32);
  }

  return fallback;
}

function redactErrorMessage(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(
      /((?:["']?x-typesense-api-key["']?|["']?api[_-]?key["']?|["']?token["']?|["']?secret["']?|["']?password["']?)\s*[:=]\s*)["']?[^\s,}]+["']?/gi,
      '$1[REDACTED]',
    )
    .slice(0, 256);
}

export function formatTypesenseError(error: unknown): string {
  const record = isRecord(error) ? error : undefined;
  const response = isRecord(record?.response) ? record.response : undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof record?.message === 'string'
        ? record.message
        : typeof error === 'string'
          ? error
          : 'Unknown error';
  const status = firstDefined(
    record?.httpStatus,
    record?.status,
    response?.status,
  );
  const code = record?.code;

  return [
    `status=${formatErrorValue(status, 'unknown')}`,
    `code=${formatErrorValue(code, 'unknown')}`,
    `message=${redactErrorMessage(message)}`,
  ].join(' ');
}

export function isTypesenseAvailabilityError(error: unknown): boolean {
  const record = isRecord(error) ? error : undefined;
  const response = isRecord(record?.response) ? record.response : undefined;
  const status = firstDefined(
    record?.httpStatus,
    record?.status,
    response?.status,
  );
  const code = typeof record?.code === 'string' ? record.code : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof record?.message === 'string'
        ? record.message
        : '';

  if (typeof status === 'number' && (status === 0 || status >= 500)) {
    return true;
  }

  if (
    /^(ECONNABORTED|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT)$/i.test(
      code,
    )
  ) {
    return true;
  }

  return /timed? ?out|network|socket|connect(?:ion)? refused|unavailable/i.test(
    message,
  );
}

export function isTypesenseAlreadyExistsError(error: unknown): boolean {
  return getHttpStatusProperty(error) === 409;
}

export function isTypesenseNotFoundError(error: unknown): boolean {
  return getHttpStatusProperty(error) === 404;
}

function getHttpStatusProperty(error: unknown): unknown {
  return isRecord(error) ? error.httpStatus : undefined;
}
