import { Module } from '@nestjs/common';
import { LoadersService } from './loaders.service';
import { GeographyModule } from '../../geography/geography.module';

@Module({
  providers: [LoadersService],
  imports: [GeographyModule],
  exports: [LoadersService],
})
export class LoadersModule {}
