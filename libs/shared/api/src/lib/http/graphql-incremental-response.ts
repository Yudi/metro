export interface GraphqlResponseError {
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

/** Each emission is a new cumulative snapshot, including deferred fields. */
export interface IncrementalGraphqlResult<T> {
  readonly data?: T;
  readonly errors?: readonly GraphqlResponseError[];
  readonly hasNext: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function responseErrors(value: unknown): GraphqlResponseError[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((error) => !isRecord(error) || typeof error['message'] !== 'string')
  ) {
    throw new Error('Invalid GraphQL errors');
  }
  return value as GraphqlResponseError[];
}

function patchPath(value: unknown): (string | number)[] {
  if (
    !Array.isArray(value) ||
    value.some((key) =>
      typeof key === 'string'
        ? ['__proto__', 'prototype', 'constructor'].includes(key)
        : typeof key !== 'number' || !Number.isSafeInteger(key) || key < 0,
    )
  ) {
    throw new Error('Invalid GraphQL incremental path');
  }
  return value as (string | number)[];
}

function updateAtPath(
  current: unknown,
  path: readonly (string | number)[],
  update: (value: unknown) => unknown,
): unknown {
  if (path.length === 0) return update(current);
  const [key, ...rest] = path;
  if (Array.isArray(current) && typeof key === 'number' && key < current.length) {
    const copy = [...current];
    copy[key] = updateAtPath(copy[key], rest, update);
    return copy;
  }
  if (
    isRecord(current) &&
    typeof key === 'string' &&
    Object.prototype.hasOwnProperty.call(current, key)
  ) {
    return { ...current, [key]: updateAtPath(current[key], rest, update) };
  }
  throw new Error('GraphQL incremental path does not exist');
}

/** The path-based incremental protocol emitted by Yoga's defer/stream plugin. */
export class GraphqlResultAccumulator<T> {
  private data?: T;
  private errors: GraphqlResponseError[] = [];
  private received = false;
  private finished = false;

  accept(value: unknown): IncrementalGraphqlResult<T> {
    if (!isRecord(value) || this.finished) {
      throw new Error('Invalid GraphQL response');
    }
    if (value['hasNext'] !== undefined && typeof value['hasNext'] !== 'boolean') {
      throw new Error('Invalid GraphQL hasNext');
    }
    if (
      !this.received &&
      !Object.prototype.hasOwnProperty.call(value, 'data') &&
      !Object.prototype.hasOwnProperty.call(value, 'errors')
    ) {
      throw new Error('Missing initial GraphQL result');
    }
    this.received = true;
    if (Object.prototype.hasOwnProperty.call(value, 'data')) {
      this.data = value['data'] as T;
    }
    this.errors = [...this.errors, ...responseErrors(value['errors'])];

    if (value['incremental'] !== undefined) {
      if (!Array.isArray(value['incremental'])) {
        throw new Error('Invalid GraphQL incremental result');
      }
      for (const patch of value['incremental']) {
        if (!isRecord(patch)) throw new Error('Invalid GraphQL patch');
        const path = patchPath(patch['path']);
        this.errors = [...this.errors, ...responseErrors(patch['errors'])];
        if (Object.prototype.hasOwnProperty.call(patch, 'items')) {
          if (patch['items'] !== null && !Array.isArray(patch['items'])) {
            throw new Error('Invalid GraphQL stream items');
          }
          const items = patch['items'];
          const index = path.pop();
          this.data = updateAtPath(this.data, path, (list) => {
            if (
              !Array.isArray(list) ||
              typeof index !== 'number' ||
              index !== list.length
            ) {
              throw new Error('Invalid GraphQL stream index');
            }
            // Yoga uses items:null when a non-null streamed item fails.
            return items === null ? null : [...list, ...items];
          }) as T;
        } else if (Object.prototype.hasOwnProperty.call(patch, 'data')) {
          this.data = updateAtPath(this.data, path, (previous) => {
            const next = patch['data'];
            return isRecord(previous) && isRecord(next)
              ? { ...previous, ...next }
              : next;
          }) as T;
        }
      }
    }

    const hasNext = value['hasNext'] === true;
    this.finished = !hasNext;
    return {
      data: this.data,
      ...(this.errors.length ? { errors: this.errors } : {}),
      hasNext,
    };
  }

  finish(): void {
    if (!this.received || !this.finished) {
      throw new Error('Incomplete GraphQL response');
    }
  }
}

/**
 * MIME framing with a JSON scanner: emit a complete part immediately, without
 * waiting for the next boundary (which may arrive only after a slow resolver).
 */
export class GraphqlMultipartParser {
  private buffer = '';
  private phase: 'boundary' | 'headers' | 'body' | 'closed' = 'boundary';
  private scanned = 0;
  private depth = 0;
  private quoted = false;
  private escaped = false;

  constructor(private readonly boundary: string) {}

  push(chunk: string): unknown[] {
    this.buffer += chunk;
    const results: unknown[] = [];
    while (this.phase !== 'closed') {
      if (this.phase === 'boundary') {
        this.buffer = this.buffer.replace(/^\r?\n/, '');
        const marker = `--${this.boundary}`;
        if (this.buffer.length < marker.length + 2) break;
        if (!this.buffer.startsWith(marker)) {
          throw new Error('Invalid GraphQL multipart boundary');
        }
        const suffix = this.buffer.slice(marker.length, marker.length + 2);
        if (suffix === '--') {
          this.phase = 'closed';
          this.buffer = this.buffer.slice(marker.length + 2);
          break;
        }
        if (suffix !== '\r\n') {
          throw new Error('Invalid GraphQL multipart delimiter');
        }
        this.buffer = this.buffer.slice(marker.length + 2);
        this.phase = 'headers';
      }
      if (this.phase === 'headers') {
        const end = this.buffer.indexOf('\r\n\r\n');
        if (end < 0) break;
        if (!/^content-type:\s*application\/json\b/im.test(this.buffer.slice(0, end))) {
          throw new Error('Invalid GraphQL multipart content type');
        }
        this.buffer = this.buffer.slice(end + 4);
        this.phase = 'body';
        this.scanned = 0;
        this.depth = 0;
        this.quoted = false;
        this.escaped = false;
      }
      if (this.phase === 'body') {
        let complete = false;
        for (; this.scanned < this.buffer.length; this.scanned++) {
          const character = this.buffer[this.scanned];
          if (this.quoted) {
            if (this.escaped) this.escaped = false;
            else if (character === '\\') this.escaped = true;
            else if (character === '"') this.quoted = false;
          } else if (character === '"') this.quoted = true;
          else if (character === '{' || character === '[') this.depth++;
          else if (character === '}' || character === ']') {
            this.depth--;
            if (this.depth === 0) {
              const body = this.buffer.slice(0, this.scanned + 1);
              results.push(JSON.parse(body) as unknown);
              this.buffer = this.buffer.slice(this.scanned + 1);
              this.phase = 'boundary';
              complete = true;
              break;
            }
          }
        }
        if (!complete) break;
      }
    }
    return results;
  }

  finish(): void {
    if (this.phase !== 'closed' || this.buffer.trim()) {
      throw new Error('Incomplete GraphQL multipart response');
    }
  }
}
