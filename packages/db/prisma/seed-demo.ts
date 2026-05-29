// Seed DEMO para staging/formación (#83). Independiente del seed de tests
// (prisma/seed.ts), que es contractual para los tests/CI y NO se toca.
// Crea una organización ficticia realista con catálogo, stock e histórico de
// ventas, para que el personal practique en staging. Idempotente (upsert).
// Corre como superuser (DATABASE_URL), igual que el seed de tests.

import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/client/index.js';

const DEMO_NIF = 'B99999999';
const DEMO_PASSWORD = 'demo1234';
const HISTORY_DAYS = 45;

/** Aborta si se intenta sembrar contra producción. Datos ficticios solo en staging. */
function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'seed-demo NO debe ejecutarse con NODE_ENV=production. Es solo para staging/formación.',
    );
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL no definido — necesario para seed-demo');
}
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  assertNotProduction();

  const org = await prisma.organization.upsert({
    where: { nif: DEMO_NIF },
    update: {},
    create: { name: 'Tienda Demo Formación', nif: DEMO_NIF },
  });

  console.log(`Seed demo: organización ${org.nif} lista (${org.id}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
