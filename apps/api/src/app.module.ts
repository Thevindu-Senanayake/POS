import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

/**
 * Composition root. Feature modules are registered here as they are added
 * (auth, ingredients, orders, rooms, printing, reports, realtime, ...).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true, // env is injected by dotenv-cli (dev) or the real environment (prod)
      load: [configuration],
      validate,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
