import { Module } from '@nestjs/common';
import { AdminAccessService } from './admin-access.service';
import { AdminGuard } from './admin.guard';
import { AdminResolver } from './admin.resolver';

@Module({
  providers: [AdminAccessService, AdminGuard, AdminResolver],
  exports: [AdminAccessService, AdminGuard],
})
export class AdminAuthModule {}
