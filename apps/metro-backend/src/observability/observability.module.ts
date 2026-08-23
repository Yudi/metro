import { Module } from '@nestjs/common';
import { ClientErrorController } from './client-error.controller';

@Module({
  controllers: [ClientErrorController],
})
export class ObservabilityModule {}
