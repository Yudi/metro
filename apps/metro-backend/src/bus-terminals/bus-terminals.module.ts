import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BusTerminalResolver } from './bus-terminal.resolver';
import { BusTerminalService } from './bus-terminal.service';

@Module({
  imports: [PrismaModule],
  providers: [BusTerminalService, BusTerminalResolver],
  exports: [BusTerminalService],
})
export class BusTerminalsModule {}
