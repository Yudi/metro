export function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return undefined;
  }

  return (error as { response?: { status?: number } }).response?.status;
}

export function isAuthenticationError(error: unknown): boolean {
  const status = getHttpStatus(error);
  return status === 401 || status === 403;
}

export function formatUpstreamFailure(error: unknown): string {
  const status = getHttpStatus(error);
  if (status) {
    return `HTTP ${status}`;
  }

  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (/^[A-Za-z0-9._-]{1,40}$/.test(code)) {
      return `request failed (${code})`;
    }
  }

  return 'request failed';
}
