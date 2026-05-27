// Seed idempotente: 2 organizaciones, 2 stores cada una, 3 users por org,
// 5 products por org. Usa upsert para que correr 2 veces no duplique.
// Corre asumiendo conexión como superuser (DATABASE_URL del .env).

import bcrypt from 'bcryptjs';

import { PrismaClient, UserRole } from '../generated/client/index.js';

const prisma = new PrismaClient();

interface OrgSeed {
  nif: string;
  name: string;
  stores: Array<{ id: string; name: string }>;
  users: Array<{ email: string; name: string; role: UserRole }>;
  products: Array<{ name: string; salePrice: number }>;
}

const ORG1: OrgSeed = {
  nif: 'B11111111',
  name: 'Cadena CBD Norte',
  stores: [
    { id: '11111111-1111-1111-1111-111111111111', name: 'Tienda Madrid Centro' },
    { id: '11111111-1111-1111-1111-111111111112', name: 'Almacén Central Madrid' },
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
    { id: '22222222-2222-2222-2222-222222222221', name: 'Tienda Sevilla' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'Tienda Málaga' },
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
      update: {},
      create: { id: store.id, organizationId: org.id, name: store.name },
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
