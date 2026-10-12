import { Args, Query, Resolver } from '@nestjs/graphql';
import type {
  BusTerminalDetail,
  BusTerminalSummary,
} from '@metro/shared/bus-terminal-contracts';
import { BusTerminalDetailEntity, BusTerminalSummaryEntity } from './bus-terminal.entity';
import { BusTerminalService } from './bus-terminal.service';

@Resolver(() => BusTerminalDetailEntity)
export class BusTerminalResolver {
  constructor(private readonly terminals: BusTerminalService) {}

  @Query(() => BusTerminalDetailEntity, { name: 'busTerminal', nullable: true })
  busTerminal(
    @Args('terminalId', { type: () => String }) terminalId: string,
  ): Promise<BusTerminalDetail | null> {
    return this.terminals.getTerminal(terminalId);
  }

  @Query(() => BusTerminalSummaryEntity, {
    name: 'busTerminalForStop',
    nullable: true,
  })
  busTerminalForStop(
    @Args('stopId', { type: () => String }) stopId: string,
  ): Promise<BusTerminalSummary | null> {
    return this.terminals.getTerminalForStop(stopId);
  }
}
