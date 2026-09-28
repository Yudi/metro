import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpModule } from '@nestjs/axios';
import { GraphQLModule } from '@nestjs/graphql';
import { YogaDriver } from '@graphql-yoga/nestjs';
import type { YogaDriverConfig } from '@graphql-yoga/nestjs';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { GqlThrottlerGuard } from '../common/guards/gql-throttler.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { UserModule } from '../user/user.module';
import { LoadersService } from '../common/graphql/loaders.service';
import { LoadersModule } from '../common/graphql/loaders.module';
import { ObservabilityModule } from '../observability/observability.module';
import { validatePublicEnvironment } from './public-environment.validation';
import { RequestContextModule } from '../common/request-context/request-context.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SaoPauloTransitModule } from '../cities/sp/sp-transit.module';
import { createGraphQLYogaConfig } from '../common/graphql/graphql-yoga.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validatePublicEnvironment,
    }),
    RequestContextModule,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000,
          limit: 600,
        },
        {
          name: 'strict',
          ttl: 60_000,
          limit: 120,
        },
      ],
    }),
    GraphQLModule.forRootAsync<YogaDriverConfig>({
      driver: YogaDriver,
      imports: [LoadersModule],
      inject: [LoadersService],
      useFactory: createGraphQLYogaConfig,
    }),
    HttpModule,
    PrismaModule,
    SaoPauloTransitModule,
    UserModule,
    NotificationsModule,
    ObservabilityModule,
    LoadersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
  ],
})
export class AppModule {}
