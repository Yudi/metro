import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { BusTerminalsModule } from '../bus-terminals/bus-terminals.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';
import { StationImagesModule } from '../station-images/station-images.module';
import { AdminMediaResolver } from './admin-media.resolver';
import { AdminImageFileScalar } from './admin-media.graphql.types';
import { AdminImageConversionService } from './admin-image-conversion.service';
import { AdminMediaService } from './admin-media.service';

@Module({
  imports: [
    AdminAuthModule,
    BusTerminalsModule,
    PrismaModule,
    SearchModule,
    StationImagesModule,
  ],
  providers: [
    AdminMediaService,
    AdminImageConversionService,
    AdminMediaResolver,
    AdminImageFileScalar,
  ],
  exports: [AdminMediaService],
})
export class AdminMediaModule {}
