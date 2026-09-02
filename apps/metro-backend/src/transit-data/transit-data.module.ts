import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TransitDataPrecomputeService } from './transit-data-precompute.service';

@Module({
  imports: [PrismaModule],
  providers: [TransitDataPrecomputeService],
  exports: [TransitDataPrecomputeService],
})
export class TransitDataModule {}
