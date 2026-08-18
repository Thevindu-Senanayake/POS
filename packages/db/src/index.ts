// Re-export the generated Prisma client (PrismaClient, all model types, enums,
// and the Prisma namespace incl. Decimal) plus the shared singleton.
export * from '@prisma/client';
export { Prisma, PrismaClient } from '@prisma/client';
export { prisma } from './client.js';
