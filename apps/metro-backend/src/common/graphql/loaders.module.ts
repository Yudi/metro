import { Module } from '@nestjs/common';
import { LoadersService } from './loaders.service';
import { SaoPauloTransitModule } from '../../cities/sp/sp-transit.module';

@Module({
  providers: [LoadersService],
  imports: [SaoPauloTransitModule],
  exports: [LoadersService],
})
export class LoadersModule {}
