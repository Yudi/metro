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
