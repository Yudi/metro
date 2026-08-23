import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ImportLockService } from '../common/import-lock.service';

@Global()
@Module({
  providers: [PrismaService, ImportLockService],
  exports: [PrismaService, ImportLockService],
})
export class PrismaModule {}
