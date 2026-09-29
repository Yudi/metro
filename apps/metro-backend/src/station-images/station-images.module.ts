import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  createStationImagesS3Client,
  STATION_IMAGES_S3_CLIENT,
  StationImagesService,
} from './station-images.service';
import { StationImagesController } from './station-images.controller';

@Module({
  imports: [ConfigModule],
  controllers: [StationImagesController],
  providers: [
    {
      provide: STATION_IMAGES_S3_CLIENT,
      inject: [ConfigService],
      useFactory: createStationImagesS3Client,
    },
    StationImagesService,
  ],
})
export class StationImagesModule {}
