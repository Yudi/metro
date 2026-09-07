import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TransitDataPrecomputeService } from './transit-data-precompute.service';
import { PhysicalStopService } from './physical-stop.service';

@Module({
  imports: [PrismaModule],
  providers: [TransitDataPrecomputeService, PhysicalStopService],
  exports: [TransitDataPrecomputeService],
})
export class TransitDataModule {}
