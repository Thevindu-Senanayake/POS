import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: config.get<string[]>('corsOrigin'), credentials: true });
  app.enableShutdownHooks();

  const port = config.get<number>('port') ?? 4000;
  await app.listen(port);
  new Logger('Bootstrap').log(`POS API listening on http://localhost:${port}/api`);
}

void bootstrap();
