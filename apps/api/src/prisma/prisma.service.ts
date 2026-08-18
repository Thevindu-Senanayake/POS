import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@pos/db';

/**
 * PrismaClient wired into Nest's lifecycle. Injected everywhere via the global
 * PrismaModule. All money/stock mutations run through `this.$transaction(...)`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to the database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
