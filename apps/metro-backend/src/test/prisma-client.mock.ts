export class PrismaClient {
  $connect(): Promise<void> {
    return Promise.resolve();
  }

  $disconnect(): Promise<void> {
    return Promise.resolve();
  }
}

type SqlValue = {
  readonly strings: TemplateStringsArray | string[];
  readonly values: readonly unknown[];
};

export const Prisma = {
  empty: '',
  join(values: readonly unknown[]): readonly unknown[] {
    return values;
  },
  raw(value: string): string {
    return value;
  },
  sql(strings: TemplateStringsArray, ...values: unknown[]): SqlValue {
    return {
      strings,
      values,
    };
  },
};

export const historical_incident_event_type = {
  RAIL_STATUS_INCIDENT: 'RAIL_STATUS_INCIDENT',
  RAIL_STATUS_RECOVERED: 'RAIL_STATUS_RECOVERED',
  BACKEND_ONLINE: 'BACKEND_ONLINE',
  BACKEND_OFFLINE: 'BACKEND_OFFLINE',
  BACKEND_OFFLINE_DETECTED: 'BACKEND_OFFLINE_DETECTED',
  RETRIEVAL_ISSUE: 'RETRIEVAL_ISSUE',
} as const;
