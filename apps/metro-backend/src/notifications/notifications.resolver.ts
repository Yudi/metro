import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator';
import { NotificationSettingsService } from './notification-settings.service';
import {
  NotificationConfiguration,
  NotificationTarget,
  NotificationTrigger,
} from '@metro/shared/notification-contracts';

@Resolver()
@UseGuards(AuthGuard)
export class NotificationsResolver {
  constructor(
    private readonly notificationSettings: NotificationSettingsService,
  ) {}

  @Query(() => GraphQLJSON, {
    name: 'notificationConfiguration',
    description:
      'Return the authenticated account notification configuration and safe device summaries.',
  })
  getConfiguration(
    @CurrentUserId() userId: string,
  ): Promise<NotificationConfiguration> {
    return this.notificationSettings.getConfiguration(userId);
  }

  @Query(() => GraphQLJSON, {
    name: 'notificationTargets',
    description:
      'Search server-owned notification targets for the authenticated account.',
  })
  getTargets(
    @Args('kind', { type: () => String }) kind: string,
    @Args('search', { type: () => String }) search: string,
  ): Promise<NotificationTarget[]> {
    return this.notificationSettings.getTargets(kind, search);
  }

  @Mutation(() => GraphQLJSON, {
    name: 'saveNotificationTrigger',
    description:
      'Create or update an account notification trigger with optimistic revision checking.',
  })
  saveTrigger(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
    @Args('id', { type: () => String, nullable: true }) id: string | undefined,
    @Args('expectedRevision', { type: () => Int, nullable: true })
    expectedRevision: number | undefined,
    @CurrentUserId() userId: string,
  ): Promise<NotificationTrigger> {
    return this.notificationSettings.saveTrigger(
      userId,
      input,
      id,
      expectedRevision,
    );
  }

  @Mutation(() => Boolean, {
    name: 'deleteNotificationTrigger',
    description:
      'Delete an account notification trigger when its revision is current.',
  })
  deleteTrigger(
    @Args('id', { type: () => String }) id: string,
    @Args('expectedRevision', { type: () => Int }) expectedRevision: number,
    @CurrentUserId() userId: string,
  ): Promise<boolean> {
    return this.notificationSettings.deleteTrigger(
      userId,
      id,
      expectedRevision,
    );
  }

  @Mutation(() => String, {
    name: 'registerNotificationDevice',
    description:
      'Register or refresh a push device for the authenticated account.',
  })
  registerDevice(
    @Args('input', { type: () => GraphQLJSON }) input: unknown,
    @CurrentUserId() userId: string,
  ): Promise<string> {
    return this.notificationSettings.registerDevice(userId, input);
  }

  @Mutation(() => Boolean, {
    name: 'removeNotificationDevice',
    description: 'Remove a push device owned by the authenticated account.',
  })
  removeDevice(
    @Args('id', { type: () => String }) id: string,
    @CurrentUserId() userId: string,
  ): Promise<boolean> {
    if (!id) {
      throw new BadRequestException('Notification device id is required.');
    }
    return this.notificationSettings.removeDevice(userId, id);
  }
}
