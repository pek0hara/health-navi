let prismaInstance: any = null;

try {
  // Prismaが利用可能な場合のみインポート
  const { PrismaClient } = require('@prisma/client');

  const globalForPrisma = global as unknown as { prisma: any };
  const databaseUrl = process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL;

  if (databaseUrl) {
    prismaInstance =
      globalForPrisma.prisma ||
      new PrismaClient({
        datasources: {
          db: { url: databaseUrl },
        },
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });

    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = prismaInstance;
    }
  }
} catch (error) {
  console.warn('Prisma client not available, running without database');
}

export const prisma = prismaInstance;
