import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RailIntegrationClientModule } from '../rail-integration/rail-integration-client.module';
import { HistoricalResolver } from './historical.resolver';
import { HistoricalService } from './historical.service';

@Global()
@Module({
  imports: [PrismaModule, RailIntegrationClientModule],
  providers: [HistoricalResolver, HistoricalService],
  exports: [HistoricalService],
})
export class HistoricalModule {}
