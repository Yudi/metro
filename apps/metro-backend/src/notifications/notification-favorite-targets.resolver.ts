import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import type {
  NotificationTarget,
  NotificationTargetKind,
} from '@metro/shared/notification-contracts';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { NotificationFavoriteTargetsService } from './notification-favorite-targets.service';

@Resolver()
@UseGuards(AuthGuard)
export class NotificationFavoriteTargetsResolver {
  constructor(
    private readonly favoriteTargets: NotificationFavoriteTargetsService,
  ) {}

  @Query(() => GraphQLJSON, {
    name: 'notificationFavoriteTargets',
    description:
      'Return resolved notification target suggestions from the authenticated account favorites.',
  })
  getFavoriteTargets(
    @Args('kind', { type: () => String }) kind: string,
    @CurrentUserId() userId: string,
  ): Promise<NotificationTarget[]> {
    return this.favoriteTargets.getTargets(
      userId,
      kind as NotificationTargetKind,
    );
  }
}
