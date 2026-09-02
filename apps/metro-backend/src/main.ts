import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { initializeFirebase } from './startup/firebase';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RequestContextService } from './common/request-context/request-context.service';
import { createRequestTimingMiddleware } from './observability/request-timing.middleware';

export async function bootstrap() {
  initializeFirebase();

  const isProduction = process.env.NODE_ENV === 'production';
  const logLevels: (
    | 'error'
    | 'warn'
    | 'log'
    | 'debug'
    | 'verbose'
    | 'fatal'
  )[] = isProduction
    ? ['error', 'warn', 'log', 'fatal']
    : ['error', 'warn', 'log', 'debug', /*'verbose',*/ 'fatal'];

  const app = await NestFactory.create(AppModule, {
    logger: logLevels,
  });
  if (isProduction) {
    const expressApp = app.getHttpAdapter().getInstance() as {
      set(name: string, value: number): void;
    };
    expressApp.set('trust proxy', 1);
  }
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const requestContext = app.get(RequestContextService);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const suppliedRequestId = req.header('x-request-id')?.trim();
    const requestId =
      suppliedRequestId && /^[A-Za-z0-9._-]{8,128}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);
    requestContext.run(requestId, next);
  });
  app.use(createRequestTimingMiddleware());

  // Global ValidationPipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS
  const devOrigins = [
    'http://localhost:4200',
    'http://localhost:4201',
    'http://127.0.0.1:4200',
    'http://127.0.0.1:4201',
  ];
  const prodOrigins = ['https://metro.yudi.com.br'];
  const allowedOrigins =
    process.env.ALLOWED_ORIGINS?.split(',') ||
    (process.env.NODE_ENV === 'production' ? prodOrigins : devOrigins);

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  });

  const isSwaggerEnabled =
    !isProduction || process.env.SWAGGER_ENABLED === 'true';

  if (isSwaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Transporte Metropolitano API')
      .setDescription(
        'Documentação da API do projeto "Transporte Metropolitano de São Paulo"',
      )
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(
    `Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  Logger.fatal(`Backend startup failed: ${message}`);
  process.exitCode = 1;
});
