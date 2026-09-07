export function withCause(message: string, cause: unknown): Error {
  const wrapped = new Error(message);
  Object.defineProperty(wrapped, 'cause', {
    configurable: true,
    enumerable: false,
    value: cause,
  });
  return wrapped;
}
