// Test de integración: valida el control horario contra Postgres real.
// Garantías cubiertas:
//   1. Secuencia válida (entrada → pausa → fin pausa → salida) persiste 4 filas.
//   2. La máquina de estados rechaza transiciones inválidas (salida sin entrada).
//   3. `today` resume estado, horas y fichajes del día.
//   4. Aislamiento multi-tenant (RLS): org2 no ve los fichajes de org1.
//   5. `history` agrupa por empleado con totales de horas.
//
// Requisitos previos (igual que cash-sessions.integration):
//   - Postgres corriendo, migraciones aplicadas (incluida TimeClockEntry + pausas), seed.
//   - DATABASE_URL (superuser) para descubrir IDs.
//   - DATABASE_URL_APP apunta al rol `app` para PrismaService.

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { TimeClockService } from '../src/time-clock/time-clock.service.js';

const HOUR = 60 * 60 * 1000;

describe('Control horario — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let service: TimeClockService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let store1Id: string;
  let store2Id: string;
  let user1Id: string;
  let user2Id: string;
  let deviceId: string;

  async function clearEntries() {
    await admin.$executeRaw`DELETE FROM "TimeClockEntry" WHERE "organizationId" = ${org1Id}::uuid`;
    await admin.$executeRaw`DELETE FROM "TimeClockEntry" WHERE "organizationId" = ${org2Id}::uuid`;
  }

  function punch(type: 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END') {
    return tenantStorage.run({ organizationId: org1Id }, () =>
      service.create({ storeId: store1Id, deviceId, type }, user1Id, 'ADMIN'),
    );
  }

  // Siembra un fichaje con timestamp explícito (para historiales deterministas)
  // usando el cliente superusuario: evita la validación de secuencia y la RLS en
  // el setup. La LECTURA del historial sí se ejercita por el servicio con tenant.
  function insertAt(userId: string, type: string, createdAt: Date) {
    return insertAtStore(userId, store1Id, type, createdAt);
  }

  // Variante con tienda explícita: para historiales cross-tienda (historyAll).
  function insertAtStore(userId: string, storeId: string, type: string, createdAt: Date) {
    return admin.timeClockEntry.create({
      data: {
        organizationId: org1Id,
        storeId,
        userId,
        deviceId,
        type: type as never,
        createdAt,
      },
    });
  }

  // Asignación de tienda del CLERK (UserStore): assertStoreAccess la exige para que
  // un CLERK pueda leer su histórico. El seed base no la crea, así que la gestiona
  // el test con el superusuario.
  async function setMembership(userId: string, storeId: string, present: boolean) {
    if (present) {
      await admin.$executeRaw`
        INSERT INTO "UserStore" ("userId", "storeId") VALUES (${userId}::uuid, ${storeId}::uuid)
        ON CONFLICT DO NOTHING
      `;
    } else {
      await admin.$executeRaw`
        DELETE FROM "UserStore" WHERE "userId" = ${userId}::uuid AND "storeId" = ${storeId}::uuid
      `;
    }
  }

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    service = new TimeClockService(prisma as unknown as PrismaService, base);

    const adminUrl = process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL (superuser) requerido para descubrir IDs en setup.');
    }
    const { PrismaClient: AdminClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    admin = new AdminClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });

    const found1 = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Organization" WHERE nif = 'B11111111'
    `;
    const found2 = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Organization" WHERE nif = 'B22222222'
    `;
    if (found1.length === 0 || found2.length === 0) {
      throw new Error(
        'Seed no ejecutado. Corre `pnpm --filter @simpletpv/db exec prisma db seed`.',
      );
    }
    org1Id = found1[0]!.id;
    org2Id = found2[0]!.id;

    const stores = await admin.$queryRaw<Array<{ id: string; code: string }>>`
      SELECT id::text, code FROM "Store" WHERE "organizationId" = ${org1Id}::uuid ORDER BY code
    `;
    store1Id = stores[0]!.id;
    // Segunda tienda de la org para los historiales cross-tienda (historyAll).
    store2Id = stores[1]!.id;

    const u1 = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "User" WHERE email = 'clerk@org1.test'
    `;
    const u2 = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "User" WHERE email = 'admin@org1.test'
    `;
    user1Id = u1[0]!.id;
    user2Id = u2[0]!.id;

    // Limpia estado previo y crea un dispositivo oficial autorizado para store1.
    // El dispositivo se siembra con el cliente superusuario (sortea la RLS en el
    // setup); el fichaje real sí se ejercita a través del servicio con tenant.
    await clearEntries();
    await admin.$executeRaw`DELETE FROM "OfficialDevice" WHERE "organizationId" = ${org1Id}::uuid`;
    const device = await admin.officialDevice.create({
      data: {
        organizationId: org1Id,
        storeId: store1Id,
        name: 'TPV Test',
        pairingToken: 'TC-INTEGRATION-TOKEN',
        authorized: true,
      },
    });
    deviceId = device.id;
  });

  afterAll(async () => {
    await clearEntries();
    await admin.$executeRaw`DELETE FROM "OfficialDevice" WHERE "organizationId" = ${org1Id}::uuid`;
    await setMembership(user1Id, store1Id, false);
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  it('persiste la secuencia entrada → pausa → fin pausa → salida', async () => {
    await clearEntries();
    expect((await punch('CLOCK_IN')).type).toBe('CLOCK_IN');
    expect((await punch('BREAK_START')).type).toBe('BREAK_START');
    expect((await punch('BREAK_END')).type).toBe('BREAK_END');
    expect((await punch('CLOCK_OUT')).type).toBe('CLOCK_OUT');

    const count = await admin.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::int AS n FROM "TimeClockEntry" WHERE "organizationId" = ${org1Id}::uuid AND "userId" = ${user1Id}::uuid
    `;
    expect(Number(count[0]!.n)).toBe(4);
  });

  it('rechaza una transición inválida (salida sin entrada)', async () => {
    await clearEntries();
    await expect(punch('CLOCK_OUT')).rejects.toThrow(/No tienes ningún fichaje activo/);
  });

  it('today refleja el estado fichado y los fichajes del día', async () => {
    await clearEntries();
    await punch('CLOCK_IN');

    const summary = await tenantStorage.run({ organizationId: org1Id }, () =>
      service.today(store1Id, user1Id),
    );
    expect(summary.status).toBe('IN');
    expect(summary.entries).toHaveLength(1);
    expect(summary.runningSince).not.toBeNull();
  });

  it('aísla por tenant: org2 no ve los fichajes de org1', async () => {
    await clearEntries();
    await punch('CLOCK_IN');

    const summary = await tenantStorage.run({ organizationId: org2Id }, () =>
      service.today(store1Id, user1Id),
    );
    expect(summary.status).toBe('OUT');
    expect(summary.entries).toHaveLength(0);

    const history = await tenantStorage.run({ organizationId: org2Id }, () =>
      service.history({ storeId: store1Id }, 'ADMIN', user1Id),
    );
    expect(history).toHaveLength(0);
  });

  it('history agrupa por empleado con totales de horas', async () => {
    await clearEntries();
    // user1: jornada de 8h; user2: jornada de 4h (timestamps explícitos).
    await insertAt(user1Id, 'CLOCK_IN', new Date('2026-06-04T08:00:00.000Z'));
    await insertAt(user1Id, 'CLOCK_OUT', new Date('2026-06-04T16:00:00.000Z'));
    await insertAt(user2Id, 'CLOCK_IN', new Date('2026-06-04T09:00:00.000Z'));
    await insertAt(user2Id, 'CLOCK_OUT', new Date('2026-06-04T13:00:00.000Z'));

    const rows = await tenantStorage.run({ organizationId: org1Id }, () =>
      service.history(
        { storeId: store1Id, from: '2026-01-01', to: '2026-12-31' },
        'ADMIN',
        user1Id,
      ),
    );

    expect(rows).toHaveLength(2);
    const byUser = new Map(rows.map((r) => [r.userId, r]));
    expect(byUser.get(user1Id)!.workedMs).toBe(8 * HOUR);
    expect(byUser.get(user2Id)!.workedMs).toBe(4 * HOUR);
    expect(byUser.get(user1Id)!.userName).toBeTruthy();
  });

  it('historyAll agrega jornadas de TODAS las tiendas de la org; org2 no las ve (RLS)', async () => {
    await clearEntries();
    // El mismo empleado ficha 8h en store1 y 2h en store2 el mismo día → dos jornadas
    // distintas (la clave de agrupación incluye la tienda).
    await insertAt(user1Id, 'CLOCK_IN', new Date('2026-06-04T08:00:00.000Z'));
    await insertAt(user1Id, 'CLOCK_OUT', new Date('2026-06-04T16:00:00.000Z'));
    await insertAtStore(user1Id, store2Id, 'CLOCK_IN', new Date('2026-06-04T18:00:00.000Z'));
    await insertAtStore(user1Id, store2Id, 'CLOCK_OUT', new Date('2026-06-04T20:00:00.000Z'));

    const rows = await tenantStorage.run({ organizationId: org1Id }, () =>
      service.historyAll({ from: '2026-01-01', to: '2026-12-31' }),
    );

    const mine = rows.filter((r) => r.userId === user1Id);
    expect(mine).toHaveLength(2);
    const byStore = new Map(mine.map((r) => [r.storeId, r]));
    expect(byStore.get(store1Id)!.workedMs).toBe(8 * HOUR);
    expect(byStore.get(store2Id)!.workedMs).toBe(2 * HOUR);

    // RLS: desde org2 no se ve ninguna jornada de org1.
    const fromOrg2 = await tenantStorage.run({ organizationId: org2Id }, () =>
      service.historyAll({ from: '2026-01-01', to: '2026-12-31' }),
    );
    expect(fromOrg2).toHaveLength(0);
  });

  it('history/me: un CLERK con acceso a la tienda lee SOLO sus propias jornadas', async () => {
    await clearEntries();
    await setMembership(user1Id, store1Id, true);
    // Mismo día: user1 (el CLERK) 8h; user2 (otro empleado) 4h.
    await insertAt(user1Id, 'CLOCK_IN', new Date('2026-06-04T08:00:00.000Z'));
    await insertAt(user1Id, 'CLOCK_OUT', new Date('2026-06-04T16:00:00.000Z'));
    await insertAt(user2Id, 'CLOCK_IN', new Date('2026-06-04T09:00:00.000Z'));
    await insertAt(user2Id, 'CLOCK_OUT', new Date('2026-06-04T13:00:00.000Z'));

    // El endpoint fuerza userId = requestingUser; aquí se ejercita el service igual.
    const rows = await tenantStorage.run({ organizationId: org1Id }, () =>
      service.history(
        { storeId: store1Id, userId: user1Id, from: '2026-01-01', to: '2026-12-31' },
        'CLERK',
        user1Id,
      ),
    );

    // Solo su jornada; nunca aparece la de user2.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(user1Id);
    expect(rows[0]!.workedMs).toBe(8 * HOUR);

    await setMembership(user1Id, store1Id, false);
  });

  it('history/me: un CLERK sin acceso a la tienda recibe 403', async () => {
    await setMembership(user1Id, store1Id, false);

    await expect(
      tenantStorage.run({ organizationId: org1Id }, () =>
        service.history({ storeId: store1Id, userId: user1Id }, 'CLERK', user1Id),
      ),
    ).rejects.toThrow(/No tienes acceso a esa tienda/);
  });

  it('entries: log en bruto de la tienda, lo más reciente primero; org2 no lo ve (RLS)', async () => {
    await clearEntries();
    await insertAt(user1Id, 'CLOCK_IN', new Date('2026-06-04T08:00:00.000Z'));
    await insertAt(user1Id, 'CLOCK_OUT', new Date('2026-06-04T16:00:00.000Z'));

    const rows = await tenantStorage.run({ organizationId: org1Id }, () =>
      service.entries(
        { storeId: store1Id, from: '2026-06-01', to: '2026-06-30' },
        'ADMIN',
        user1Id,
      ),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]!.type).toBe('CLOCK_OUT'); // 16:00 antes que 08:00 (orden desc)
    expect(rows[1]!.type).toBe('CLOCK_IN');
    expect(rows[0]!.userName).toBeTruthy();
    expect(typeof rows[0]!.createdAt).toBe('string');

    // RLS: desde org2 no se ven los fichajes de org1.
    const fromOrg2 = await tenantStorage.run({ organizationId: org2Id }, () =>
      service.entries(
        { storeId: store1Id, from: '2026-06-01', to: '2026-06-30' },
        'ADMIN',
        user1Id,
      ),
    );
    expect(fromOrg2).toHaveLength(0);
  });
});
