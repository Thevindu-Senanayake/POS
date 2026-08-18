import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness + DB connectivity probe. */
  @Get()
  async check(): Promise<{ status: string; db: 'up' | 'down'; timestamp: string }> {
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    return { status: 'ok', db, timestamp: new Date().toISOString() };
  }
}
