import { ErrorHandler, Service, inject, isDevMode } from '@angular/core';

export interface ErrorContext {
  component?: string;
  method?: string;
  userId?: string;
  timestamp?: Date;
  [key: string]: unknown;
}

export interface ErrorLog {
  message: string;
  error: unknown;
  context: ErrorContext;
  timestamp: Date;
  severity: 'error' | 'warning' | 'critical';
}

interface ClientErrorEvent {
  eventId: string;
  sessionId: string;
  severity: ErrorLog['severity'];
  message: string;
  errorName?: string;
  stack?: string;
  route: string;
  release?: string;
  timestamp: string;
  context: Record<string, string | number | boolean | null>;
}

const ERROR_QUEUE_KEY = 'metro-client-error-outbox-v1';
const MAX_QUEUED_ERRORS = 20;
const SENSITIVE_CONTEXT_KEY =
  /token|authorization|cookie|password|secret|credential|user.?id|latitude|longitude|coordinate/i;

@Service()
export class ErrorTrackingService {
  private errorLog: ErrorLog[] = [];
  private readonly MAX_LOG_SIZE = 100;
  private readonly sessionId = createEventId();
  private initialized = false;

  initialize(): void {
    if (this.initialized || typeof window === 'undefined') {
      return;
    }
    this.initialized = true;
    window.addEventListener('online', () => void this.flushQueuedErrors());
    void this.flushQueuedErrors();
  }

  trackError(
    message: string,
    error: unknown,
    context: ErrorContext = {},
    severity: ErrorLog['severity'] = 'error',
  ): void {
    this.initialize();
    const errorLog: ErrorLog = {
      message: message.slice(0, 500),
      error: sanitizeError(error),
      context: {
        ...context,
        timestamp: new Date(),
      },
      timestamp: new Date(),
      severity,
    };

    this.errorLog.unshift(errorLog);
    if (this.errorLog.length > this.MAX_LOG_SIZE) {
      this.errorLog = this.errorLog.slice(0, this.MAX_LOG_SIZE);
    }

    if (isDevMode()) {
      console.error(`[ErrorTracking] ${severity.toUpperCase()}: ${message}`, {
        context,
        error: errorLog.error,
      });
    } else {
      void this.send(this.toClientEvent(errorLog));
    }
  }

  trackWarning(message: string, context: ErrorContext = {}): void {
    this.trackError(message, new Error(message), context, 'warning');
  }

  trackCritical(
    message: string,
    error: unknown,
    context: ErrorContext = {},
  ): void {
    this.trackError(message, error, context, 'critical');
  }

  getRecentErrors(limit = 10): ErrorLog[] {
    return this.errorLog.slice(0, limit);
  }

  getErrorsBySeverity(severity: ErrorLog['severity']): ErrorLog[] {
    return this.errorLog.filter((log) => log.severity === severity);
  }

  clearErrors(): void {
    this.errorLog = [];
  }

  exportErrors(): string {
    return JSON.stringify(this.errorLog, null, 2);
  }

  private toClientEvent(log: ErrorLog): ClientErrorEvent {
    const error = sanitizeError(log.error);
    return {
      eventId: createEventId(),
      sessionId: this.sessionId,
      severity: log.severity,
      message: log.message,
      errorName: error.name,
      stack: error.stack,
      route:
        typeof window === 'undefined' ? 'server' : window.location.pathname,
      release:
        typeof document === 'undefined'
          ? undefined
          : document
              .querySelector<HTMLMetaElement>('meta[name="app-version"]')
              ?.content.slice(0, 128),
      timestamp: log.timestamp.toISOString(),
      context: sanitizeContext(log.context),
    };
  }

  private async send(event: ClientErrorEvent): Promise<void> {
    if (typeof window === 'undefined' || !navigator.onLine) {
      this.queue(event);
      return;
    }

    try {
      const response = await fetch('/api/client-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        credentials: 'omit',
        keepalive: true,
      });
      if (!response.ok) {
        this.queue(event);
      }
    } catch {
      this.queue(event);
    }
  }

  private queue(event: ClientErrorEvent): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      const queued = this.readQueue();
      queued.push(event);
      localStorage.setItem(
        ERROR_QUEUE_KEY,
        JSON.stringify(queued.slice(-MAX_QUEUED_ERRORS)),
      );
    } catch {
      // Storage can be unavailable in privacy modes. The in-memory log remains.
    }
  }

  private async flushQueuedErrors(): Promise<void> {
    if (
      typeof localStorage === 'undefined' ||
      typeof navigator === 'undefined' ||
      !navigator.onLine
    ) {
      return;
    }
    const queued = this.readQueue();
    if (queued.length === 0) {
      return;
    }
    localStorage.removeItem(ERROR_QUEUE_KEY);
    for (const event of queued) {
      await this.send(event);
    }
  }

  private readQueue(): ClientErrorEvent[] {
    try {
      const value = localStorage.getItem(ERROR_QUEUE_KEY);
      const parsed: unknown = value ? JSON.parse(value) : [];
      return Array.isArray(parsed)
        ? (parsed.slice(-MAX_QUEUED_ERRORS) as ClientErrorEvent[])
        : [];
    } catch {
      return [];
    }
  }
}

@Service()
export class TelemetryErrorHandler extends ErrorHandler {
  private readonly tracking = inject(ErrorTrackingService);

  override handleError(error: unknown): void {
    this.tracking.trackCritical('Unhandled frontend error', error, {
      source: 'angular_error_handler',
    });
    if (isDevMode()) {
      super.handleError(error);
    }
  }
}

function sanitizeError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    'message' in error
  ) {
    const structured = error as { name: unknown; message: unknown; stack?: unknown };
    return {
      name: String(structured.name).slice(0, 160),
      message: redactString(String(structured.message), 500),
      stack:
        typeof structured.stack === 'string'
          ? redactString(structured.stack, 8_000)
          : undefined,
    };
  }
  const normalized = new Error(String(error ?? 'Unknown error'));
  return {
    name: normalized.name,
    message: redactString(normalized.message, 500),
    stack: normalized.stack
      ? redactString(normalized.stack, 8_000)
      : undefined,
  };
}

function sanitizeContext(
  context: ErrorContext,
): Record<string, string | number | boolean | null> {
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(context).slice(0, 20)) {
    if (SENSITIVE_CONTEXT_KEY.test(key)) {
      continue;
    }
    if (typeof value === 'string') {
      sanitized[key] = redactString(value, 500);
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      sanitized[key] = value;
    } else if (value instanceof Date) {
      sanitized[key] = value.toISOString();
    }
  }
  return sanitized;
}

function redactString(value: string, maximumLength: number): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|key|secret|code)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, maximumLength);
}

function createEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
