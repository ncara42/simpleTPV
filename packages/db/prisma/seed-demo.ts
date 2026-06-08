// Seed DEMO para staging/formación (#83). Independiente del seed de tests
// (prisma/seed.ts), que es contractual para los tests/CI y NO se toca.
// Crea una organización ficticia realista con catálogo, stock e histórico de
// ventas, para que el personal practique en staging. Idempotente (upsert).
// Corre como superuser (DATABASE_URL), igual que el seed de tests.

import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

import {
  AlertType,
  CashSessionStatus,
  MovementType,
  PaymentMethod,
  PrismaClient,
  PromoConditionType,
  PromoDiscountType,
  SaleStatus,
  TimeClockType,
  UserRole,
  VerifactuStatus,
  VerifactuType,
} from '../generated/client/index.js';

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

interface FamilySeed {
  key: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
}

const FAMILIES: FamilySeed[] = [
  { key: 'flores', name: 'Flores CBD', color: '#4CAF50', icon: '🌿', sortOrder: 1 },
  { key: 'aceites', name: 'Aceites', color: '#FFC107', icon: '💧', sortOrder: 2 },
  { key: 'cosmetica', name: 'Cosmética', color: '#E91E63', icon: '🧴', sortOrder: 3 },
  { key: 'accesorios', name: 'Accesorios', color: '#607D8B', icon: '🛍️', sortOrder: 4 },
];

interface SubfamilySeed {
  key: string;
  parentKey: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
}

const SUBFAMILIES: SubfamilySeed[] = [
  {
    key: 'flores-indica',
    parentKey: 'flores',
    name: 'Índica',
    color: '#4CAF50',
    icon: '🌿',
    sortOrder: 1,
  },
  {
    key: 'flores-sativa',
    parentKey: 'flores',
    name: 'Sativa',
    color: '#4CAF50',
    icon: '🌿',
    sortOrder: 2,
  },
  {
    key: 'aceites-suave',
    parentKey: 'aceites',
    name: 'Suaves (≤5%)',
    color: '#FFC107',
    icon: '💧',
    sortOrder: 1,
  },
  {
    key: 'aceites-fuerte',
    parentKey: 'aceites',
    name: 'Fuertes (≥10%)',
    color: '#FFC107',
    icon: '💧',
    sortOrder: 2,
  },
  {
    key: 'cosmetica-facial',
    parentKey: 'cosmetica',
    name: 'Facial',
    color: '#E91E63',
    icon: '🧴',
    sortOrder: 1,
  },
  {
    key: 'cosmetica-corporal',
    parentKey: 'cosmetica',
    name: 'Corporal',
    color: '#E91E63',
    icon: '🧴',
    sortOrder: 2,
  },
];

interface ProductSeed {
  family: string;
  name: string;
  barcode: string;
  salePrice: number;
  costPrice: number;
  minStock: number;
  initialStock: number;
}

const PRODUCTS: ProductSeed[] = [
  {
    family: 'flores',
    name: 'Flor CBD Lemon Haze 20%',
    barcode: '8400000000011',
    salePrice: 12.5,
    costPrice: 5.0,
    minStock: 10,
    initialStock: 40,
  },
  {
    family: 'flores',
    name: 'Flor CBD Amnesia 18%',
    barcode: '8400000000028',
    salePrice: 11.0,
    costPrice: 4.5,
    minStock: 10,
    initialStock: 8,
  },
  {
    family: 'flores',
    name: 'Flor CBD OG Kush 22%',
    barcode: '8400000000035',
    salePrice: 13.5,
    costPrice: 5.5,
    minStock: 10,
    initialStock: 30,
  },
  {
    family: 'flores',
    name: 'Flor CBD Gorilla 15%',
    barcode: '8400000000042',
    salePrice: 9.9,
    costPrice: 4.0,
    minStock: 10,
    initialStock: 0,
  },
  {
    family: 'flores',
    name: 'Hash CBD Maroc',
    barcode: '8400000000059',
    salePrice: 15.0,
    costPrice: 6.5,
    minStock: 8,
    initialStock: 25,
  },
  {
    family: 'flores',
    name: 'Pre-roll CBD x3',
    barcode: '8400000000066',
    salePrice: 8.5,
    costPrice: 3.2,
    minStock: 12,
    initialStock: 50,
  },
  {
    family: 'aceites',
    name: 'Aceite CBD 5%',
    barcode: '8400000000110',
    salePrice: 24.9,
    costPrice: 10.0,
    minStock: 6,
    initialStock: 20,
  },
  {
    family: 'aceites',
    name: 'Aceite CBD 10%',
    barcode: '8400000000127',
    salePrice: 39.9,
    costPrice: 16.0,
    minStock: 6,
    initialStock: 15,
  },
  {
    family: 'aceites',
    name: 'Aceite CBD 20%',
    barcode: '8400000000134',
    salePrice: 59.9,
    costPrice: 24.0,
    minStock: 4,
    initialStock: 3,
  },
  {
    family: 'aceites',
    name: 'Aceite CBD + Melatonina',
    barcode: '8400000000141',
    salePrice: 29.9,
    costPrice: 12.0,
    minStock: 6,
    initialStock: 18,
  },
  {
    family: 'aceites',
    name: 'Cápsulas CBD 30u',
    barcode: '8400000000158',
    salePrice: 27.5,
    costPrice: 11.0,
    minStock: 6,
    initialStock: 22,
  },
  {
    family: 'cosmetica',
    name: 'Crema CBD facial',
    barcode: '8400000000219',
    salePrice: 19.95,
    costPrice: 8.0,
    minStock: 5,
    initialStock: 16,
  },
  {
    family: 'cosmetica',
    name: 'Crema CBD muscular',
    barcode: '8400000000226',
    salePrice: 22.0,
    costPrice: 9.0,
    minStock: 5,
    initialStock: 4,
  },
  {
    family: 'cosmetica',
    name: 'Bálsamo labial CBD',
    barcode: '8400000000233',
    salePrice: 6.5,
    costPrice: 2.2,
    minStock: 10,
    initialStock: 35,
  },
  {
    family: 'cosmetica',
    name: 'Champú CBD',
    barcode: '8400000000240',
    salePrice: 14.0,
    costPrice: 5.5,
    minStock: 6,
    initialStock: 12,
  },
  {
    family: 'cosmetica',
    name: 'Sérum CBD',
    barcode: '8400000000257',
    salePrice: 34.0,
    costPrice: 14.0,
    minStock: 4,
    initialStock: 10,
  },
  {
    family: 'accesorios',
    name: 'Grinder metálico',
    barcode: '8400000000318',
    salePrice: 9.0,
    costPrice: 3.0,
    minStock: 8,
    initialStock: 28,
  },
  {
    family: 'accesorios',
    name: 'Papel de liar x5',
    barcode: '8400000000325',
    salePrice: 3.5,
    costPrice: 1.0,
    minStock: 20,
    initialStock: 80,
  },
  {
    family: 'accesorios',
    name: 'Filtros x100',
    barcode: '8400000000332',
    salePrice: 4.0,
    costPrice: 1.2,
    minStock: 20,
    initialStock: 60,
  },
  {
    family: 'accesorios',
    name: 'Bolsa hermética',
    barcode: '8400000000349',
    salePrice: 2.5,
    costPrice: 0.6,
    minStock: 25,
    initialStock: 5,
  },
  {
    family: 'accesorios',
    name: 'Bote cristal UV',
    barcode: '8400000000356',
    salePrice: 7.0,
    costPrice: 2.5,
    minStock: 10,
    initialStock: 24,
  },
  {
    family: 'accesorios',
    name: 'Mechero recargable',
    barcode: '8400000000363',
    salePrice: 5.5,
    costPrice: 1.8,
    minStock: 15,
    initialStock: 40,
  },
  {
    family: 'accesorios',
    name: 'Bandeja liar',
    barcode: '8400000000370',
    salePrice: 11.0,
    costPrice: 4.0,
    minStock: 8,
    initialStock: 14,
  },
  {
    family: 'accesorios',
    name: 'Camiseta marca',
    barcode: '8400000000387',
    salePrice: 18.0,
    costPrice: 7.0,
    minStock: 5,
    initialStock: 9,
  },
  {
    family: 'accesorios',
    name: 'Vaporizador portátil',
    barcode: '8400000000394',
    salePrice: 49.0,
    costPrice: 22.0,
    minStock: 3,
    initialStock: 6,
  },
];

const STORES = [
  { code: '01', name: 'Tienda Demo Centro' },
  { code: '02', name: 'Tienda Demo Norte' },
];

const MORE_STORES = [
  { code: '03', name: 'Tienda Demo Sur', address: 'Pza. Sur 3', active: true },
  { code: '04', name: 'Tienda Demo Gran Vía', address: 'Gran Vía 41', active: true },
  { code: '05', name: 'Tienda Demo Online', address: 'eCommerce', active: true },
  { code: '06', name: 'Almacén Demo', address: 'Pol. Ind. 7', active: false },
];

/** Crea tiendas, familias, productos y stock inicial variado. Idempotente. */
async function seedCatalog(orgId: string): Promise<void> {
  for (const s of STORES) {
    await prisma.store.upsert({
      where: { organizationId_code: { organizationId: orgId, code: s.code } },
      update: { name: s.name },
      create: { organizationId: orgId, code: s.code, name: s.name },
    });
  }

  const familyIdByKey = new Map<string, string>();
  for (const f of FAMILIES) {
    const existing = await prisma.productFamily.findFirst({
      where: { organizationId: orgId, name: f.name },
    });
    const fam = existing
      ? await prisma.productFamily.update({
          where: { id: existing.id },
          data: { color: f.color, icon: f.icon, sortOrder: f.sortOrder },
        })
      : await prisma.productFamily.create({
          data: {
            organizationId: orgId,
            name: f.name,
            color: f.color,
            icon: f.icon,
            sortOrder: f.sortOrder,
          },
        });
    familyIdByKey.set(f.key, fam.id);
  }

  const stores = await prisma.store.findMany({ where: { organizationId: orgId } });
  for (const p of PRODUCTS) {
    let product = await prisma.product.findFirst({
      where: { organizationId: orgId, name: p.name },
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          organizationId: orgId,
          familyId: familyIdByKey.get(p.family) ?? null,
          name: p.name,
          barcode: p.barcode,
          salePrice: p.salePrice,
          costPrice: p.costPrice,
        },
      });
    }
    for (const store of stores) {
      await prisma.stock.upsert({
        where: { productId_storeId: { productId: product.id, storeId: store.id } },
        update: {},
        create: {
          organizationId: orgId,
          productId: product.id,
          storeId: store.id,
          quantity: p.initialStock,
          minStock: p.minStock,
        },
      });
    }
  }
}

/** Crea subfamilias (jerarquía de 2 niveles) para familias existentes. Idempotente. */
async function seedSubfamilies(orgId: string): Promise<void> {
  const familyIdByKey = new Map<string, string>();
  const families = await prisma.productFamily.findMany({
    where: { organizationId: orgId, parentId: null },
  });
  for (const f of families) {
    const key = FAMILIES.find((fam) => fam.name === f.name)?.key;
    if (key) familyIdByKey.set(key, f.id);
  }

  for (const sf of SUBFAMILIES) {
    const parentId = familyIdByKey.get(sf.parentKey);
    if (!parentId) continue;

    const existing = await prisma.productFamily.findFirst({
      where: { organizationId: orgId, name: sf.name, parentId },
    });
    if (!existing) {
      await prisma.productFamily.create({
        data: {
          organizationId: orgId,
          parentId,
          name: sf.name,
          color: sf.color,
          icon: sf.icon,
          sortOrder: sf.sortOrder,
        },
      });
    }
  }
}

/** Crea tiendas adicionales (Sur, Gran Vía, Online, Almacén). Idempotente. */
async function seedMoreStores(orgId: string): Promise<void> {
  for (const s of MORE_STORES) {
    await prisma.store.upsert({
      where: { organizationId_code: { organizationId: orgId, code: s.code } },
      update: { name: s.name, address: s.address, active: s.active },
      create: {
        organizationId: orgId,
        code: s.code,
        name: s.name,
        address: s.address,
        active: s.active,
      },
    });
  }
}

interface UserSeed {
  email: string;
  name: string;
  role: UserRole;
}

const USERS: UserSeed[] = [
  { email: 'admin@demo.simpletpv', name: 'Admin Demo', role: UserRole.ADMIN },
  { email: 'manager@demo.simpletpv', name: 'Encargada Demo', role: UserRole.MANAGER },
  { email: 'clerk@demo.simpletpv', name: 'Dependiente Demo', role: UserRole.CLERK },
];

const MORE_USERS: UserSeed[] = [
  { email: 'jon@demo.simpletpv', name: 'Jon Aguirre', role: UserRole.CLERK },
];

/** Crea usuarios demo y los asigna a TODAS las tiendas de la org. Idempotente. */
async function seedUsers(orgId: string, passwordHash: string): Promise<void> {
  const stores = await prisma.store.findMany({ where: { organizationId: orgId } });
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        organizationId: orgId,
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role,
      },
    });
    for (const store of stores) {
      await prisma.userStore.upsert({
        where: { userId_storeId: { userId: user.id, storeId: store.id } },
        update: {},
        create: { userId: user.id, storeId: store.id },
      });
    }
  }
}

/** Crea usuarios adicionales con asignación específica de tienda. Idempotente. */
async function seedMoreUsers(orgId: string, passwordHash: string): Promise<void> {
  const stores = await prisma.store.findMany({ where: { organizationId: orgId } });
  const surStore = stores.find((s) => s.code === '03');

  for (const u of MORE_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        organizationId: orgId,
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role,
      },
    });
    if (surStore) {
      await prisma.userStore.upsert({
        where: { userId_storeId: { userId: user.id, storeId: surStore.id } },
        update: {},
        create: { userId: user.id, storeId: surStore.id },
      });
    }
  }
}

/** PRNG determinista (mulberry32). Mismo seed → misma secuencia. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Devuelve la fecha de hace `daysAgo` días, a la hora `hour:minute`. */
function dateDaysAgo(daysAgo: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function yyyymmdd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Genera histórico de ~HISTORY_DAYS días: ventas (con líneas), movimientos de
 * stock y sesiones de caja. Determinista e idempotente: ticketNumber es clave
 * natural; si una venta ya existe, se salta. Ajusta el stock final restando lo
 * vendido.
 */
async function seedHistory(
  orgId: string,
  stores: Array<{ id: string; code: string }>,
  products: Array<{ id: string; name: string; salePrice: number; taxRate: number }>,
  userId: string,
): Promise<void> {
  const rand = seededRandom(99999);
  const soldByKey = new Map<string, number>();

  for (let daysAgo = HISTORY_DAYS; daysAgo >= 0; daysAgo--) {
    for (const store of stores) {
      const opened = dateDaysAgo(daysAgo, 9, 0);
      const isToday = daysAgo === 0;
      const numSales = 5 + Math.floor(rand() * 11);
      let cashTotal = 0;

      for (let i = 1; i <= numSales; i++) {
        const ticketNumber = `${store.code}-${yyyymmdd(opened)}-${String(i).padStart(3, '0')}`;

        // Generamos TODO el aleatorio de esta venta ANTES de decidir si ya existe,
        // para que el PRNG avance igual exista o no la venta. Si el `continue` fuera
        // antes de consumir estos rand(), una re-ejecución desincronizaría el PRNG
        // (los días saltados consumirían distinto) y dejaría de ser idempotente.
        const numLines = 1 + Math.floor(rand() * 3);
        const lines: Array<{
          productId: string;
          name: string;
          unitPrice: number;
          qty: number;
          taxRate: number;
          lineTotal: number;
        }> = [];
        let subtotal = 0;
        for (let l = 0; l < numLines; l++) {
          const p = products[Math.floor(rand() * products.length)]!;
          const qty = 1 + Math.floor(rand() * 3);
          const unitPrice = Number(p.salePrice);
          const lineTotal = round2(unitPrice * qty);
          subtotal = round2(subtotal + lineTotal);
          lines.push({
            productId: p.id,
            name: p.name,
            unitPrice,
            qty,
            taxRate: p.taxRate,
            lineTotal,
          });
        }
        const total = subtotal;
        const payment = rand() < 0.6 ? PaymentMethod.CASH : PaymentMethod.CARD;
        const hour = 9 + Math.floor(rand() * 11);
        const minute = Math.floor(rand() * 60);
        const createdAt = dateDaysAgo(daysAgo, hour, minute);

        // Ya consumido todo el aleatorio de esta venta: ahora sí decidimos si
        // insertarla. Si ya existe (re-ejecución), saltamos sin tocar la caja ni
        // el stock — el PRNG ya avanzó igual que en la primera ejecución.
        const existing = await prisma.sale.findUnique({
          where: { organizationId_ticketNumber: { organizationId: orgId, ticketNumber } },
        });
        if (existing) continue;

        if (payment === PaymentMethod.CASH) cashTotal = round2(cashTotal + total);
        for (const ln of lines) {
          soldByKey.set(
            `${ln.productId}|${store.id}`,
            (soldByKey.get(`${ln.productId}|${store.id}`) ?? 0) + ln.qty,
          );
        }

        await prisma.sale.create({
          data: {
            organizationId: orgId,
            storeId: store.id,
            userId,
            ticketNumber,
            subtotal,
            total,
            paymentMethod: payment,
            status: SaleStatus.COMPLETED,
            createdAt,
            lines: {
              create: lines.map((ln) => ({
                organizationId: orgId,
                productId: ln.productId,
                name: ln.name,
                unitPrice: ln.unitPrice,
                qty: ln.qty,
                taxRate: ln.taxRate,
                lineTotal: ln.lineTotal,
              })),
            },
          },
        });
      }

      // Si re-ejecutamos en un día distinto, la sesión que antes era "hoy" (OPEN)
      // ahora pertenece al pasado: ciérrala antes de crear la del día en curso, o
      // chocaría con el índice único de una sola sesión OPEN por tienda.
      // Filtramos por openedAt <= opened (el día en curso del bucle) para no tocar
      // la sesión de hoy si ya existe (isToday impide que este bloque corra para hoy).
      if (!isToday) {
        await prisma.cashSession.updateMany({
          where: {
            organizationId: orgId,
            storeId: store.id,
            status: CashSessionStatus.OPEN,
            openedAt: { lte: opened },
          },
          data: { status: CashSessionStatus.CLOSED, closedAt: dateDaysAgo(daysAgo, 21, 0) },
        });
      }

      const sessionExists = await prisma.cashSession.findFirst({
        where: { organizationId: orgId, storeId: store.id, openedAt: opened },
      });
      if (!sessionExists) {
        await prisma.cashSession.create({
          data: {
            organizationId: orgId,
            storeId: store.id,
            userId,
            openingAmount: 100,
            closingAmount: isToday ? null : round2(100 + cashTotal),
            expectedAmount: isToday ? null : round2(100 + cashTotal),
            difference: isToday ? null : 0,
            status: isToday ? CashSessionStatus.OPEN : CashSessionStatus.CLOSED,
            openedAt: opened,
            closedAt: isToday ? null : dateDaysAgo(daysAgo, 21, 0),
          },
        });
      }
    }
  }

  for (const [key, sold] of soldByKey) {
    const [productId, storeId] = key.split('|') as [string, string];
    const stock = await prisma.stock.findUnique({
      where: { productId_storeId: { productId, storeId } },
    });
    if (!stock) continue;
    const newQty = Math.max(0, Number(stock.quantity) - sold);
    await prisma.stock.update({
      where: { productId_storeId: { productId, storeId } },
      data: { quantity: newQty },
    });
    await prisma.stockMovement.create({
      data: {
        organizationId: orgId,
        productId,
        storeId,
        userId,
        type: MovementType.SALE,
        quantity: -sold,
        reason: 'Histórico demo de ventas',
      },
    });
  }
}

/** Crea fichajes (CLOCK_IN/CLOCK_OUT) de los últimos 5 días. Idempotente. */
async function seedTimeClock(orgId: string): Promise<void> {
  const users = await prisma.user.findMany({
    where: { organizationId: orgId, role: { in: [UserRole.MANAGER, UserRole.CLERK] } },
  });
  const stores = await prisma.store.findMany({ where: { organizationId: orgId, active: true } });

  for (let daysAgo = 4; daysAgo >= 0; daysAgo--) {
    for (const user of users) {
      const store = stores[daysAgo % stores.length];
      if (!store) continue;

      const clockInTime = dateDaysAgo(daysAgo, 9, 0);
      const clockOutTime = dateDaysAgo(daysAgo, 17, 30);

      const existingIn = await prisma.timeClockEntry.findFirst({
        where: {
          organizationId: orgId,
          userId: user.id,
          storeId: store.id,
          type: TimeClockType.CLOCK_IN,
          createdAt: { gte: clockInTime, lt: dateDaysAgo(daysAgo, 10, 0) },
        },
      });
      if (!existingIn) {
        await prisma.timeClockEntry.create({
          data: {
            organizationId: orgId,
            userId: user.id,
            storeId: store.id,
            type: TimeClockType.CLOCK_IN,
            createdAt: clockInTime,
          },
        });
      }

      const existingOut = await prisma.timeClockEntry.findFirst({
        where: {
          organizationId: orgId,
          userId: user.id,
          storeId: store.id,
          type: TimeClockType.CLOCK_OUT,
          createdAt: { gte: dateDaysAgo(daysAgo, 17, 0), lt: dateDaysAgo(daysAgo, 18, 0) },
        },
      });
      if (!existingOut) {
        await prisma.timeClockEntry.create({
          data: {
            organizationId: orgId,
            userId: user.id,
            storeId: store.id,
            type: TimeClockType.CLOCK_OUT,
            createdAt: clockOutTime,
          },
        });
      }
    }
  }
}

/** Crea registros VeriFactu encadenados (hash + previousHash). Idempotente. */
async function seedVerifactu(orgId: string): Promise<void> {
  const sales = await prisma.sale.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
    take: 6,
  });

  let previousHash: string | null = null;
  for (let i = 0; i < sales.length; i++) {
    const sale = sales[i];
    if (!sale) continue;
    const hash = `hash-demo-${i}-${sale.id.slice(0, 8)}`;

    const existing = await prisma.verifactuRecord.findFirst({
      where: { organizationId: orgId, saleId: sale.id },
    });
    if (existing) {
      previousHash = hash;
      continue;
    }

    await prisma.verifactuRecord.create({
      data: {
        organizationId: orgId,
        saleId: sale.id,
        type: VerifactuType.INVOICE,
        status: VerifactuStatus.SENT,
        hash,
        previousHash,
        payload: {
          total: Number(sale.total),
          ticketNumber: sale.ticketNumber,
        },
        attempts: 1,
        sentAt: sale.createdAt,
      },
    });
    previousHash = hash;
  }
}

/** Crea lotes con caducidad (1 caducado, 2 por caducar). Idempotente. */
async function seedBatches(orgId: string): Promise<void> {
  const products = await prisma.product.findMany({
    where: { organizationId: orgId },
    take: 3,
  });
  const stores = await prisma.store.findMany({
    where: { organizationId: orgId, active: true },
    take: 2,
  });

  const batches = [
    { productIndex: 0, storeIndex: 0, lotCode: 'LOT-2405-A', daysFromNow: -6, quantity: 8 },
    { productIndex: 1, storeIndex: 0, lotCode: 'LOT-2601-C', daysFromNow: 9, quantity: 15 },
    { productIndex: 2, storeIndex: 1, lotCode: 'LOT-2603-B', daysFromNow: 27, quantity: 22 },
  ];

  for (const b of batches) {
    const product = products[b.productIndex];
    const store = stores[b.storeIndex];
    if (!product || !store) continue;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + b.daysFromNow);

    await prisma.stockBatch.upsert({
      where: {
        productId_storeId_lotCode: {
          productId: product.id,
          storeId: store.id,
          lotCode: b.lotCode,
        },
      },
      update: {},
      create: {
        organizationId: orgId,
        productId: product.id,
        storeId: store.id,
        lotCode: b.lotCode,
        expiryDate,
        quantity: b.quantity,
      },
    });

    if (product) {
      await prisma.product.update({
        where: { id: product.id },
        data: { tracksBatch: true },
      });
    }
  }
}

/** Crea alertas de stock (OUT_OF_STOCK). Idempotente. */
async function seedAlerts(orgId: string): Promise<void> {
  const products = await prisma.product.findMany({
    where: { organizationId: orgId },
    take: 2,
  });
  const centroStore = await prisma.store.findFirst({
    where: { organizationId: orgId, code: '01' },
  });

  if (!centroStore) return;

  for (const product of products) {
    const existing = await prisma.stockAlert.findFirst({
      where: {
        organizationId: orgId,
        productId: product.id,
        storeId: centroStore.id,
        resolved: false,
      },
    });
    if (existing) continue;

    await prisma.stockAlert.create({
      data: {
        organizationId: orgId,
        productId: product.id,
        storeId: centroStore.id,
        alertType: AlertType.OUT_OF_STOCK,
      },
    });
  }
}

/** Crea clientes B2B, lista de precios y pedidos mayoristas. Idempotente. */
async function seedB2B(orgId: string): Promise<void> {
  const priceList = await prisma.priceList.upsert({
    where: { organizationId_name: { organizationId: orgId, name: 'Tarifa Mayorista Demo' } },
    update: {},
    create: { organizationId: orgId, name: 'Tarifa Mayorista Demo' },
  });

  const products = await prisma.product.findMany({
    where: { organizationId: orgId },
    take: 5,
  });

  for (const p of products) {
    await prisma.priceListItem.upsert({
      where: { priceListId_productId: { priceListId: priceList.id, productId: p.id } },
      update: {},
      create: {
        organizationId: orgId,
        priceListId: priceList.id,
        productId: p.id,
        price: Number(p.salePrice) * 0.7,
      },
    });
  }

  const customers = [
    { name: 'Herbolario Natural SL', nif: 'B12345678', email: 'compras@herbolario.com' },
    { name: 'Farmacia Centro', nif: 'B87654321', email: 'pedidos@farmaciacentro.com' },
  ];

  for (const c of customers) {
    let customer = await prisma.customer.findFirst({
      where: { organizationId: orgId, nif: c.nif },
    });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          organizationId: orgId,
          name: c.name,
          nif: c.nif,
          email: c.email,
          priceListId: priceList.id,
        },
      });
    }

    const existingOrder = await prisma.wholesaleOrder.findFirst({
      where: { organizationId: orgId, customerId: customer.id },
    });
    if (existingOrder) continue;

    const orderProducts = products.slice(0, 3);
    const lines = orderProducts.map((p) => ({
      organizationId: orgId,
      productId: p.id,
      qty: 10,
      unitPrice: Number(p.salePrice) * 0.7,
      lineTotal: Number(p.salePrice) * 0.7 * 10,
    }));

    await prisma.wholesaleOrder.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,
        status: 'CONFIRMED',
        total: lines.reduce((sum, l) => sum + l.lineTotal, 0),
        lines: { create: lines },
      },
    });
  }
}

/** Crea feature flags demo. Idempotente. */
async function seedFeatureFlags(orgId: string): Promise<void> {
  const flags = [
    { key: 'module.b2b', enabled: true },
    { key: 'module.timeclock', enabled: true },
    { key: 'module.verifactu', enabled: false },
  ];

  for (const f of flags) {
    const existing = await prisma.featureFlag.findFirst({
      where: { organizationId: orgId, key: f.key, storeId: null },
    });
    if (existing) continue;

    await prisma.featureFlag.create({
      data: {
        organizationId: orgId,
        key: f.key,
        enabled: f.enabled,
      },
    });
  }
}

/** Crea overrides de precio por tienda. Idempotente. */
async function seedStorePrices(orgId: string): Promise<void> {
  const products = await prisma.product.findMany({
    where: { organizationId: orgId },
    take: 3,
  });
  const stores = await prisma.store.findMany({
    where: { organizationId: orgId, active: true },
    take: 2,
  });

  for (const product of products) {
    for (const store of stores) {
      const overridePrice = Number(product.salePrice) * 0.95;
      await prisma.storePrice.upsert({
        where: { productId_storeId: { productId: product.id, storeId: store.id } },
        update: {},
        create: {
          organizationId: orgId,
          productId: product.id,
          storeId: store.id,
          price: overridePrice,
        },
      });
    }
  }
}

// Promociones demo (#143): 4 reglas que cubren los 3 grupos del backoffice
// (Activas / Programadas / Inactivas). Fechas relativas a hoy para que la
// clasificación promoStatus() sea estable se ejecute cuando se ejecute el seed.
// Idempotente por [organizationId, name].
async function seedPromotions(orgId: string): Promise<void> {
  const day = (offset: number): Date => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return d;
  };
  const promos = [
    // Activa: en rango y active
    {
      name: '2 o más Flores: -15%',
      conditionType: PromoConditionType.min_qty,
      threshold: 2,
      discountType: PromoDiscountType.percent,
      discountValue: 15,
      startDate: day(-10),
      endDate: day(20),
      active: true,
    },
    // Activa: por importe de ticket
    {
      name: 'Ahorra 10€ en compras de 50€+',
      conditionType: PromoConditionType.min_ticket,
      threshold: 50,
      discountType: PromoDiscountType.amount,
      discountValue: 10,
      startDate: day(-5),
      endDate: day(25),
      active: true,
    },
    // Programada: empieza en el futuro
    {
      name: 'Campaña verano CBD',
      conditionType: PromoConditionType.min_ticket,
      threshold: 40,
      discountType: PromoDiscountType.percent,
      discountValue: 10,
      startDate: day(5),
      endDate: day(35),
      active: true,
    },
    // Inactiva: en rango pero pausada (active=false)
    {
      name: 'Black Friday (pausada)',
      conditionType: PromoConditionType.min_qty,
      threshold: 3,
      discountType: PromoDiscountType.percent,
      discountValue: 20,
      startDate: day(-10),
      endDate: day(20),
      active: false,
    },
  ];
  for (const p of promos) {
    await prisma.promotion.upsert({
      where: { organizationId_name: { organizationId: orgId, name: p.name } },
      update: {},
      create: { organizationId: orgId, ...p },
    });
  }
}

async function main(): Promise<void> {
  assertNotProduction();

  const org = await prisma.organization.upsert({
    where: { nif: DEMO_NIF },
    update: {},
    create: { name: 'Tienda Demo Formación', nif: DEMO_NIF },
  });

  await seedCatalog(org.id);
  await seedSubfamilies(org.id);
  await seedMoreStores(org.id);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await seedUsers(org.id, passwordHash);
  await seedMoreUsers(org.id, passwordHash);

  const stores = await prisma.store.findMany({
    where: { organizationId: org.id },
    select: { id: true, code: true },
    orderBy: { code: 'asc' },
  });
  const products = await prisma.product.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true, salePrice: true, taxRate: true },
    orderBy: { name: 'asc' },
  });
  const clerk = await prisma.user.findFirstOrThrow({
    where: { organizationId: org.id, role: UserRole.CLERK },
    select: { id: true },
  });
  await seedHistory(
    org.id,
    stores,
    products.map((p) => ({
      id: p.id,
      name: p.name,
      salePrice: Number(p.salePrice),
      taxRate: Number(p.taxRate),
    })),
    clerk.id,
  );

  await seedTimeClock(org.id);
  await seedVerifactu(org.id);
  await seedBatches(org.id);
  await seedAlerts(org.id);
  await seedB2B(org.id);
  await seedFeatureFlags(org.id);
  await seedStorePrices(org.id);
  await seedPromotions(org.id);

  console.log(`Seed demo completado: organización ${org.nif} con catálogo, usuarios e histórico.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
