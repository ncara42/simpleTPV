// Seed idempotente: 2 organizaciones, 2 stores cada una, 3 users por org,
// 5 products por org. Usa upsert para que correr 2 veces no duplique.
// Corre asumiendo conexión como superuser (DATABASE_URL del .env).
//
// Prisma 7 ya no acepta url en schema.prisma — pasamos adapter explícito
// con la URL del entorno.

import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

import { PrismaClient, UserRole } from '../generated/client/index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL no definido — necesario para seed');
}
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

interface OrgSeed {
  nif: string;
  name: string;
  stores: Array<{ id: string; name: string; code: string }>;
  users: Array<{ email: string; name: string; role: UserRole }>;
  products: Array<{ name: string; salePrice: number }>;
}

const ORG1: OrgSeed = {
  nif: 'B11111111',
  name: 'Cadena CBD Norte',
  stores: [
    { id: '2526f846-fdec-4fc7-b499-73387cbe62b1', name: 'Tienda Madrid Centro', code: '01' },
    { id: 'f2467184-afba-472a-9f61-581ed513c549', name: 'Almacén Central Madrid', code: '02' },
  ],
  users: [
    { email: 'admin@org1.test', name: 'Admin Org1', role: UserRole.ADMIN },
    { email: 'manager@org1.test', name: 'Manager Org1', role: UserRole.MANAGER },
    { email: 'clerk@org1.test', name: 'Clerk Org1', role: UserRole.CLERK },
  ],
  products: [
    { name: 'Flor CBD 20%', salePrice: 12.5 },
    { name: 'Aceite CBD 5%', salePrice: 29.9 },
    { name: 'Crema CBD', salePrice: 19.95 },
    { name: 'Té CBD', salePrice: 7.5 },
    { name: 'Vape CBD', salePrice: 34.0 },
  ],
};

const ORG2: OrgSeed = {
  nif: 'B22222222',
  name: 'Distribuidora Sur',
  stores: [
    { id: '4ffa4dbc-051d-480e-9b3d-cace2eef9074', name: 'Tienda Sevilla', code: '01' },
    { id: '8c0d4d65-6682-4639-ba21-98ab9f8ac016', name: 'Tienda Málaga', code: '02' },
  ],
  users: [
    { email: 'admin@org2.test', name: 'Admin Org2', role: UserRole.ADMIN },
    { email: 'manager@org2.test', name: 'Manager Org2', role: UserRole.MANAGER },
    { email: 'clerk@org2.test', name: 'Clerk Org2', role: UserRole.CLERK },
  ],
  products: [
    { name: 'Bolsa premium 1g', salePrice: 9.0 },
    { name: 'Pack mensual', salePrice: 49.0 },
    { name: 'Accesorio A', salePrice: 4.5 },
    { name: 'Accesorio B', salePrice: 6.0 },
    { name: 'Merch camiseta', salePrice: 18.0 },
  ],
};

async function seedOrg(spec: OrgSeed, passwordHash: string): Promise<void> {
  const org = await prisma.organization.upsert({
    where: { nif: spec.nif },
    update: {},
    create: { name: spec.name, nif: spec.nif },
  });

  for (const store of spec.stores) {
    await prisma.store.upsert({
      where: { id: store.id },
      update: { code: store.code },
      create: { id: store.id, organizationId: org.id, name: store.name, code: store.code },
    });
  }

  for (const user of spec.users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        organizationId: org.id,
        email: user.email,
        name: user.name,
        passwordHash,
        role: user.role,
      },
    });
  }

  for (const p of spec.products) {
    const existing = await prisma.product.findFirst({
      where: { organizationId: org.id, name: p.name },
    });
    if (!existing) {
      await prisma.product.create({
        data: {
          organizationId: org.id,
          name: p.name,
          salePrice: p.salePrice,
        },
      });
    }
  }

  // Stock inicial: 100 unidades de cada producto en cada tienda de la org, para
  // tener datos con los que probar venta/devolución/traspasos. Idempotente: el
  // @@unique([productId, storeId]) + upsert evita duplicar al re-sembrar.
  const products = await prisma.product.findMany({ where: { organizationId: org.id } });
  const stores = await prisma.store.findMany({ where: { organizationId: org.id } });
  for (const product of products) {
    for (const store of stores) {
      await prisma.stock.upsert({
        where: { productId_storeId: { productId: product.id, storeId: store.id } },
        update: {},
        create: {
          organizationId: org.id,
          productId: product.id,
          storeId: store.id,
          quantity: 100,
        },
      });
    }
  }
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('password123', 10);
  await seedOrg(ORG1, passwordHash);
  await seedOrg(ORG2, passwordHash);
  console.log('Seed completado: 2 organizaciones.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
