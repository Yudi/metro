import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const logLevels: (
    | 'error'
    | 'warn'
    | 'log'
    | 'debug'
    | 'verbose'
    | 'fatal'
  )[] = isProduction
    ? ['error', 'warn', 'fatal']
    : ['error', 'warn', 'log', 'debug', /*'verbose',*/ 'fatal'];

  const app = await NestFactory.create(AppModule, {
    logger: logLevels,
  });
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

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
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
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

bootstrap();
