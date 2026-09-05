import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClientErrorDto } from './dto/client-error.dto';

@Controller('client-errors')
export class ClientErrorController {
  private readonly logger = new Logger(ClientErrorController.name);

  @Post()
  @HttpCode(202)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  capture(@Body() event: ClientErrorDto): void {
    const record = JSON.stringify({
      event: 'frontend_error',
      eventId: event.eventId,
      sessionId: event.sessionId,
      severity: event.severity,
      message: redact(event.message, 500),
      errorName: event.errorName,
      stack: event.stack ? redact(event.stack, 8_000) : undefined,
      route: event.route.split('?')[0].slice(0, 512),
      release: event.release,
      timestamp: event.timestamp,
      context: sanitizeContext(event.context),
    });
    if (event.severity === 'critical') {
      this.logger.error(record);
      return;
    }
    this.logger.warn(record);
  }
}

const SENSITIVE_KEY =
  /token|authorization|cookie|password|secret|credential|user.?id|latitude|longitude|coordinate/i;
const MAX_CONTEXT_DEPTH = 4;
const MAX_CONTEXT_KEYS = 50;
const MAX_CONTEXT_ARRAY_ITEMS = 20;
const MAX_CONTEXT_BYTES = 8_192;

interface ContextBudget {
  keys: number;
}

function sanitizeContext(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeValue(value, 0, { keys: MAX_CONTEXT_KEYS }, new WeakSet());
  const record = isRecord(sanitized) ? sanitized : {};
  const bounded: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(record)) {
    const candidate = { ...bounded, [key]: child };
    if (serializedBytes(candidate) > MAX_CONTEXT_BYTES) {
      break;
    }
    Object.assign(bounded, candidate);
  }

  return bounded;
}

function sanitizeValue(
  value: unknown,
  depth: number,
  budget: ContextBudget,
  seen: WeakSet<object>,
): unknown {
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    return redact(value, 500);
  }
  if (typeof value !== 'object') {
    return undefined;
  }
  if (depth >= MAX_CONTEXT_DEPTH || seen.has(value)) {
    return '[REDACTED]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value.slice(0, MAX_CONTEXT_ARRAY_ITEMS)) {
      if (budget.keys <= 0) {
        break;
      }
      budget.keys--;
      items.push(sanitizeValue(item, depth + 1, budget, seen));
    }
    seen.delete(value);
    return items;
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).slice(0, MAX_CONTEXT_KEYS)) {
    if (budget.keys <= 0) {
      break;
    }
    if (
      key === '__proto__' ||
      key === 'constructor' ||
      key === 'prototype'
    ) {
      continue;
    }

    if (SENSITIVE_KEY.test(key)) {
      result[key.slice(0, 80)] = '[REDACTED]';
      budget.keys--;
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) {
      result[key.slice(0, 80)] = '[REDACTED]';
      budget.keys--;
      continue;
    }

    budget.keys--;
    const child = sanitizeValue(descriptor.value, depth + 1, budget, seen);
    if (child !== undefined) {
      result[key.slice(0, 80)] = child;
    }
  }
  seen.delete(value);
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serializedBytes(value: Record<string, unknown>): number {
  return Buffer.byteLength(JSON.stringify(value));
}

function redact(value: string, maximumLength: number): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|key|secret|code)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, maximumLength);
}
