import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpModule } from '@nestjs/axios';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'node:path';
import { Request, Response } from 'express';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { GqlThrottlerGuard } from '../common/guards/gql-throttler.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { DataImportModule } from '../data-import/data-import.module';
import { RailImportModule } from '../rail-import/rail-import.module';
import { RailModule } from '../rail/rail.module';
import { GeographyModule } from '../geography/geography.module';
import { SearchModule } from '../search/search.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { BikeModule } from '../bike/bike.module';
import { VectorTilesModule } from '../vector-tiles/vector-tiles.module';
import { NextTrainModule } from '../next-train/next-train.module';
import { UserModule } from '../user/user.module';
import { HistoricalModule } from '../historical/historical.module';
import { LoadersService } from '../shared/graphql/loaders.service';
import { LoadersModule } from '../shared/graphql/loaders.module';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';

const isProduction = process.env.NODE_ENV === 'production';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000,
          limit: 5_000,
        },
        {
          name: 'strict',
          ttl: 60_000,
          limit: 2_500,
        },
      ],
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [LoadersModule],
      inject: [LoadersService],
      useFactory: (loadersService: LoadersService) => ({
        graphiql: false,
        autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
        sortSchema: true,
        path: '/api/graphql',
        playground: false,
        introspection: !isProduction,
        plugins: [
          isProduction
            ? ApolloServerPluginLandingPageDisabled()
            : ApolloServerPluginLandingPageLocalDefault({
                embed: false,
                includeCookies: true,
              }),
        ],

        context: ({ req, res }: { req: Request; res: Response }) => ({
          req,
          res,
          loaders: loadersService.createLoaders(), // per-request loaders
        }),
      }),
    }),
    HttpModule,
    PrismaModule,
    DataImportModule,
    RailImportModule,
    RailModule,
    GeographyModule,
    SearchModule,
    RealtimeModule,
    BikeModule,
    VectorTilesModule,
    NextTrainModule,
    UserModule,
    HistoricalModule,
    PrismaModule,
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
