// Prisma 7 ya no soporta `datasource db { url = env(...) }` dentro del schema.
// La URL de conexión vive aquí. Esta config solo la usa el CLI de Prisma
// (migrate, db push, db seed). El runtime (PrismaClient en apps/api) usa
// adapter @prisma/adapter-pg pasando el connection string directamente.
//
// Docs: https://pris.ly/d/config-datasource

import 'dotenv/config';

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
