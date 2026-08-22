import { PrismaClient } from '@prisma/client';

/**
 * Shared PrismaClient singleton for standalone scripts (seed, imports, migrations).
 * (NestJS uses its own lifecycle-aware PrismaService; the till reaches the DB only
 * through the API, never Prisma directly.)
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
