import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseService } from '../search/services/typesense.service';

export interface ReadinessStatus {
  ready: boolean;
  dependencies: {
    database: 'ready' | 'unavailable';
    search: 'ready' | 'degraded';
  };
}

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseService,
  ) {}

  healthCheck(): { health: boolean } {
    return { health: true };
  }

  async readinessCheck(): Promise<ReadinessStatus> {
    let database: ReadinessStatus['dependencies']['database'] = 'unavailable';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'ready';
    } catch {
      database = 'unavailable';
    }

    return {
      ready: database === 'ready',
      dependencies: {
        database,
        search: this.typesense.isAvailable() ? 'ready' : 'degraded',
      },
    };
  }
}
