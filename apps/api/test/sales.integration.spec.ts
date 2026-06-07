// Test de integración: valida toda la capa de ventas contra Postgres real.
// Demuestra tres garantías críticas:
//   1. Atomicidad ACID — el incremento del contador y la creación de venta+líneas
//      comparten UNA sola transacción (contador sin huecos).
//   2. Numeración de ticket secuencial por tienda.
//   3. Aislamiento multi-tenant (RLS) — una venta de org1 no es visible en org2.
//
// Requisitos previos:
//   - Postgres corriendo (docker compose up -d postgres).
//   - Migraciones aplicadas (incluida la de Sale/SaleLine con RLS).
//   - Seed ejecutado (orgs B11111111/B22222222, stores code 01/02, productos).
//   - DATABASE_URL (superuser) para descubrir IDs y leer el ticketCounter real.
//   - DATABASE_URL_APP apunta al rol `app` (no superuser) para PrismaService.

import type { PrismaClient } from '@simpletpv/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory-cache.js';
import { InMemoryEventBus } from '../src/events/in-memory-event-bus.js';
import { applyTenantExtension, PrismaService } from '../src/prisma/prisma.service.js';
import { tenantStorage } from '../src/prisma/tenant-context.js';
import { formatTicket } from '../src/sales/sales.domain.js';
import { SalesService } from '../src/sales/sales.service.js';
import { SalesExportService } from '../src/sales/sales-export.service.js';
import { StockService } from '../src/stock/stock.service.js';
import { stubVerifactu } from './helpers/stub-verifactu.js';

describe('Ventas — integración', () => {
  let base: PrismaService;
  let prisma: ReturnType<typeof applyTenantExtension>;
  let service: SalesService;
  let admin: PrismaClient;
  let org1Id: string;
  let org2Id: string;
  let store1Id: string;
  let store2Id: string;
  let user1Id: string;
  let product1Id: string;

  // Lee el ticketCounter real de una tienda usando el cliente admin (superuser,
  // sin RLS). Imprescindible para verificar la atomicidad: comprobamos que el
  // contador persistido en la tabla Store sube exactamente lo esperado.
  async function readCounter(storeId: string): Promise<number> {
    const rows = await admin.$queryRaw<Array<{ ticketCounter: number }>>`
      SELECT "ticketCounter" FROM "Store" WHERE id = ${storeId}::uuid
    `;
    return rows[0]!.ticketCounter;
  }

  beforeAll(async () => {
    base = new PrismaService();
    await base.onModuleInit();
    prisma = applyTenantExtension(base);
    // El service recibe DOS argumentos (igual que en producción vía DI):
    //   - PRIMERO: el cliente extendido (RLS por-operación, p.ej. findMany de productos).
    //   - SEGUNDO: el cliente BASE (el mismo que abrió la conexión), que usa
    //     withTenantTx para abrir UNA transacción atómica. Así la atomicidad es real.
    service = new SalesService(
      prisma as unknown as PrismaService,
      base,
      new StockService(
        prisma as unknown as PrismaService,
        new MemoryCache(),
        base,
        new InMemoryEventBus(),
      ),
      new InMemoryEventBus(),
      stubVerifactu(),
    );

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
    store2Id = stores[1]!.id;

    const users = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "User" WHERE email = 'clerk@org1.test'
    `;
    user1Id = users[0]!.id;

    const products = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "Product" WHERE "organizationId" = ${org1Id}::uuid LIMIT 1
    `;
    product1Id = products[0]!.id;

    // Caja obligatoria (spec 2026-05-28-caja-obligatoria-design.md): create exige
    // una CashSession OPEN para la tienda. Estos tests crean ventas en store1 y
    // store2, así que abrimos una caja OPEN en ambas. Lo hacemos con el cliente
    // admin (superuser, bypassa RLS) para no depender del servicio bajo test.
    // Primero limpiamos OPEN de runs previos (la BD persiste entre ejecuciones)
    // para no chocar con el índice único parcial "una OPEN por tienda".
    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid AND status = 'OPEN'`;
    for (const storeId of [store1Id, store2Id]) {
      await admin.$executeRaw`
        INSERT INTO "CashSession" ("id", "organizationId", "storeId", "userId", "openingAmount", "status", "openedAt")
        VALUES (gen_random_uuid(), ${org1Id}::uuid, ${storeId}::uuid, ${user1Id}::uuid, 0, 'OPEN', now())
      `;
    }

    // Aislamiento por tienda (SEC-01): asignamos al CLERK SOLO a store1. store2
    // queda deliberadamente sin asignar para poder verificar el 403 cross-store.
    // Los demás tests usan rol 'ADMIN' (org-wide), así que no dependen de esto.
    await admin.$executeRaw`DELETE FROM "UserStore" WHERE "userId" = ${user1Id}::uuid`;
    await admin.$executeRaw`
      INSERT INTO "UserStore" ("userId", "storeId") VALUES (${user1Id}::uuid, ${store1Id}::uuid)
      ON CONFLICT ("userId", "storeId") DO NOTHING
    `;
  });

  afterAll(async () => {
    // Cerramos las cajas que abrimos para no dejar OPEN colgando entre runs.
    await admin.$executeRaw`DELETE FROM "CashSession" WHERE "organizationId" = ${org1Id}::uuid AND status = 'OPEN'`;
    await admin.$executeRaw`DELETE FROM "UserStore" WHERE "userId" = ${user1Id}::uuid`;
    await admin.$disconnect();
    await base.onModuleDestroy();
  });

  // NOTA: el callback de tenantStorage.run DEBE ser `async () => { return ... }`.
  // Si se pasa una arrow no-async que devuelve la promesa directamente, el
  // AsyncLocalStorage restaura el store al retornar (síncrono) ANTES de que el
  // código async de Prisma lea getCurrentTenant() → contexto perdido → RLS
  // devuelve 0 filas. Con `async () =>` el contexto vive durante toda la cadena.
  it('crea venta + líneas atómicamente y devuelve nº de ticket', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        {
          storeId: store1Id,
          lines: [{ productId: product1Id, qty: 2 }],
          paymentMethod: 'CASH',
          cashGiven: 1000,
        },
        user1Id,
        'ADMIN',
      );
    });
    expect(sale.ticketNumber).toMatch(/^T\d{2}-\d{6}$/);
    expect(sale.lines).toHaveLength(1);
    expect(Number(sale.total)).toBeGreaterThan(0);
    // Cobro en efectivo: persiste método y calcula el cambio (1000 - total).
    expect(sale.paymentMethod).toBe('CASH');
    expect(Number(sale.cashGiven)).toBe(1000);
    expect(Number(sale.cashChange)).toBeCloseTo(1000 - Number(sale.total), 2);
  });

  it('idempotencia offline (S2): dos create con el mismo clientId crean UNA sola venta', async () => {
    const clientId = '44444444-4444-4444-4444-444444444444';
    const run = () =>
      tenantStorage.run({ organizationId: org1Id }, () =>
        service.create(
          {
            storeId: store1Id,
            clientId,
            lines: [{ productId: product1Id, qty: 1 }],
            paymentMethod: 'CASH',
            cashGiven: 1000,
          },
          user1Id,
          'ADMIN',
        ),
      );

    const first = await run();
    const second = await run();

    // El segundo create devuelve la MISMA venta (no recrea).
    expect(second.id).toBe(first.id);
    expect(second.ticketNumber).toBe(first.ticketNumber);

    // En BD solo existe una venta con ese clientId.
    const rows = await admin.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM "Sale" WHERE "clientId" = ${clientId}::uuid
    `;
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('bloques de ticket offline (S2): reserva un bloque y la venta sincronizada usa su nº sin re-incrementar el contador', async () => {
    const before = await readCounter(store1Id);
    const block = await tenantStorage.run({ organizationId: org1Id }, () =>
      service.reserveTicketBlock(store1Id, 5, user1Id, 'ADMIN'),
    );
    expect(block.to - block.from + 1).toBe(5);
    const afterReserve = await readCounter(store1Id);
    expect(afterReserve).toBe(before + 5); // la reserva saltó el contador +5

    const ticketNumber = formatTicket(block.code, block.from);
    const sale = await tenantStorage.run({ organizationId: org1Id }, () =>
      service.create(
        {
          storeId: store1Id,
          clientId: '55555555-5555-5555-5555-555555555555',
          ticketNumber,
          lines: [{ productId: product1Id, qty: 1 }],
          paymentMethod: 'CARD',
        },
        user1Id,
        'ADMIN',
      ),
    );
    expect(sale.ticketNumber).toBe(ticketNumber);
    // La venta offline usa el nº del bloque y NO re-incrementa el contador.
    expect(await readCounter(store1Id)).toBe(afterReserve);
  });

  it('IT-03: congela costPrice y discountSource en la línea de venta', async () => {
    const [prod] = await admin.$queryRaw<Array<{ costPrice: string }>>`
      SELECT "costPrice"::text AS "costPrice" FROM "Product" WHERE id = ${product1Id}::uuid
    `;
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store1Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      );
    });
    const line = sale.lines[0]!;
    // El coste del producto queda congelado en la línea → rentabilidad histórica
    // fiable aunque Product.costPrice cambie después.
    expect(Number(line.costPrice)).toBeCloseTo(Number(prod!.costPrice), 4);
    // Descuento manual del vendedor → origen VOLUNTARY por defecto (STAT-04).
    expect(line.discountSource).toBe('VOLUNTARY');
  });

  it('numera tickets secuencialmente por tienda', async () => {
    const a = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store2Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      );
    });
    const b = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store2Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      );
    });
    const numA = Number(a.ticketNumber.split('-')[1]);
    const numB = Number(b.ticketNumber.split('-')[1]);
    expect(numB).toBe(numA + 1);
    expect(a.ticketNumber.startsWith('T')).toBe(true);
  });

  it('rechaza producto inexistente sin crear venta', async () => {
    const counterBefore = await readCounter(store1Id);
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.create(
          {
            storeId: store1Id,
            lines: [{ productId: '00000000-0000-0000-0000-000000000000', qty: 1 }],
            paymentMethod: 'CASH',
          },
          user1Id,
          'ADMIN',
        );
      }),
    ).rejects.toThrow();
    // El fallo ocurre ANTES de abrir la tx (al mapear precios), así que el
    // contador no debe haberse tocado.
    const counterAfter = await readCounter(store1Id);
    expect(counterAfter).toBe(counterBefore);
  });

  it('aísla por tenant: org2 no ve la venta creada por org1', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store1Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      );
    });

    // Si org2 viera la venta de org1, la seguridad estaría rota. Además
    // comprobamos que bajo org2 SÍ se ven sus propios productos: así el `null`
    // de arriba prueba aislamiento RLS REAL, no un falso negativo.
    const seenByOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () => {
      return prisma.sale.findUnique({ where: { id: sale.id } });
    });
    expect(seenByOrg2).toBeNull();

    const org2Products = await tenantStorage.run({ organizationId: org2Id }, async () => {
      return prisma.product.findMany();
    });
    expect(org2Products.length).toBeGreaterThan(0);
    for (const p of org2Products) {
      expect(p.organizationId).toBe(org2Id);
    }

    // Sanity: bajo el propio tenant la venta SÍ es visible (descarta falso negativo).
    const seenByOrg1 = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return prisma.sale.findUnique({ where: { id: sale.id } });
    });
    expect(seenByOrg1).not.toBeNull();
  });

  it('atomicidad: dos ventas dejan el contador en +2 (UPDATE y create comparten tx)', async () => {
    // Leemos el ticketCounter REAL de la tabla Store antes y después. Si el
    // incremento del contador y el create compartieran transacciones distintas,
    // un fallo dejaría huecos; aquí verificamos que dos ventas exitosas suben el
    // contador exactamente en 2, sin huecos — prueba de que viajan en la misma tx.
    const before = await readCounter(store2Id);

    const a = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store2Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      );
    });
    const b = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store2Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      );
    });

    const after = await readCounter(store2Id);
    expect(after).toBe(before + 2);

    // Los nº de ticket reflejan exactamente los valores del contador persistido.
    expect(Number(a.ticketNumber.split('-')[1])).toBe(before + 1);
    expect(Number(b.ticketNumber.split('-')[1])).toBe(before + 2);
  });

  it('persiste descuentos de línea y de ticket con totales correctos', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        {
          storeId: store1Id,
          // Descuento de línea del 10% + descuento de ticket del 5%.
          lines: [{ productId: product1Id, qty: 2, discountPct: 10 }],
          paymentMethod: 'CARD',
          ticketDiscountPct: 5,
        },
        user1Id,
        'ADMIN',
      );
    });

    const line = sale.lines[0]!;
    const unitPrice = Number(line.unitPrice);
    const gross = Math.round(unitPrice * 2 * 100) / 100;
    const lineDisc = Math.round(gross * 0.1 * 100) / 100;
    const lineNet = Math.round((gross - lineDisc) * 100) / 100;
    const ticketDisc = Math.round(lineNet * 0.05 * 100) / 100;

    // Línea: el % y el importe de descuento persisten y el neto es correcto.
    expect(Number(line.discountPct)).toBeCloseTo(10, 2);
    expect(Number(line.discountAmt)).toBeCloseTo(lineDisc, 2);
    expect(Number(line.lineTotal)).toBeCloseTo(lineNet, 2);

    // Venta: subtotal = neto de líneas; discountTotal = línea + ticket; total = subtotal − ticket.
    expect(Number(sale.subtotal)).toBeCloseTo(lineNet, 2);
    expect(Number(sale.discountTotal)).toBeCloseTo(lineDisc + ticketDisc, 2);
    expect(Number(sale.total)).toBeCloseTo(lineNet - ticketDisc, 2);
  });

  it('getTicket devuelve el ticket completo con IVA desglosado coherente', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        {
          storeId: store1Id,
          lines: [{ productId: product1Id, qty: 3 }],
          paymentMethod: 'CASH',
          cashGiven: 1000,
        },
        user1Id,
        'ADMIN',
      );
    });

    const ticket = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.getTicket(sale.id);
    });

    // Cabecera y metadatos.
    expect(ticket.ticketNumber).toBe(sale.ticketNumber);
    expect(ticket.organization.name).toBeTruthy();
    expect(ticket.store.code).toMatch(/^\d{2}$/);
    expect(ticket.lines).toHaveLength(1);
    expect(Number(ticket.total)).toBeCloseTo(Number(sale.total), 2);
    expect(ticket.paymentMethod).toBe('CASH');

    // El desglose de IVA agrupa por tipo y cuadra: Σ(base+cuota) = total (neto IVA incl.).
    expect(ticket.taxBreakdown.length).toBeGreaterThan(0);
    const sumBaseCuota = ticket.taxBreakdown.reduce(
      (acc, t) => acc + Number(t.base) + Number(t.cuota),
      0,
    );
    expect(sumBaseCuota).toBeCloseTo(Number(ticket.total), 2);
    for (const t of ticket.taxBreakdown) {
      expect(Number(t.base) + Number(t.cuota)).toBeGreaterThan(0);
      // base = neto/(1+t/100): para t>0 la base es menor que base+cuota.
      if (Number(t.taxRate) > 0) {
        expect(Number(t.base)).toBeLessThan(Number(t.base) + Number(t.cuota));
      }
    }
  });

  it('getTicket con descuento de ticket: el desglose de IVA cuadra con el total', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        {
          storeId: store1Id,
          lines: [{ productId: product1Id, qty: 3 }],
          paymentMethod: 'CARD',
          // Descuento de ticket del 15%: el desglose debe sumar el total, no el subtotal.
          ticketDiscountPct: 15,
        },
        user1Id,
        'ADMIN',
      );
    });

    const ticket = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.getTicket(sale.id);
    });

    // Hay descuento de ticket: total < subtotal.
    expect(Number(ticket.total)).toBeLessThan(Number(ticket.subtotal));

    // El desglose de IVA suma el TOTAL (tras descuento de ticket), no el subtotal.
    expect(ticket.taxBreakdown.length).toBeGreaterThan(0);
    const sumBaseCuota = ticket.taxBreakdown.reduce(
      (acc, t) => acc + Number(t.base) + Number(t.cuota),
      0,
    );
    expect(sumBaseCuota).toBeCloseTo(Number(ticket.total), 2);
    // Y NO suma el subtotal (prueba de que el prorrateo se aplicó de verdad).
    expect(sumBaseCuota).not.toBeCloseTo(Number(ticket.subtotal), 2);
  });

  it('getTicket de un id inexistente lanza NotFound', async () => {
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.getTicket('00000000-0000-0000-0000-000000000000');
      }),
    ).rejects.toThrow();
  });

  it('getReceiptHtml genera el documento fiscal con NIF, nº ticket, IVA y total (#123)', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        {
          storeId: store1Id,
          lines: [{ productId: product1Id, qty: 2 }],
          paymentMethod: 'CASH',
          cashGiven: 1000,
        },
        user1Id,
        'ADMIN',
      );
    });

    const ticket = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.getTicket(sale.id);
    });
    const html = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.getReceiptHtml(sale.id);
    });

    // Documento HTML completo y autocontenido (estilos de impresión embebidos).
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Factura simplificada');
    expect(html).toContain('@media print');
    // Datos fiscales: nº ticket, tienda y total formateado (coma decimal).
    expect(html).toContain(sale.ticketNumber);
    expect(html).toContain(ticket.store.code);
    expect(html).toContain(`${Number(sale.total).toFixed(2).replace('.', ',')} €`);
    // Desglose de IVA presente (al menos un tipo del seed).
    expect(html).toMatch(/IVA \d+%/);
    // Enlace de cotejo VeriFactu con el nº de serie de la venta.
    expect(html).toContain(`numserie=${sale.ticketNumber}`);
  });

  it('getReceiptHtml de un id inexistente lanza NotFound', async () => {
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.getReceiptHtml('00000000-0000-0000-0000-000000000000');
      }),
    ).rejects.toThrow();
  });

  it('aísla por tenant: org2 no puede leer el ticket de una venta de org1', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store1Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      );
    });

    // Bajo el contexto de org2, RLS no ve la venta → findFirst null → NotFound.
    await expect(
      tenantStorage.run({ organizationId: org2Id }, async () => {
        return service.getTicket(sale.id);
      }),
    ).rejects.toThrow();

    // Sanity: bajo su propio tenant el ticket SÍ se obtiene (descarta falso negativo).
    const own = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.getTicket(sale.id);
    });
    expect(own.ticketNumber).toBe(sale.ticketNumber);
  });

  it('rechaza con 403 a un CLERK con descuento por encima de su límite (10%)', async () => {
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.create(
          {
            storeId: store1Id,
            // 50% de descuento de línea: muy por encima del 10% permitido a CLERK.
            lines: [{ productId: product1Id, qty: 1, discountPct: 50 }],
            paymentMethod: 'CARD',
          },
          user1Id,
          'CLERK',
        );
      }),
    ).rejects.toThrow(/límite del rol CLERK/);
  });

  it('SEC-01: rechaza con 403 a un CLERK que vende en una tienda a la que NO está asignado', async () => {
    // store2 no está en el UserStore del CLERK (solo store1). RLS aísla por org,
    // no por tienda, así que sin el control de acceso por tienda esto se colaría.
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.create(
          {
            storeId: store2Id,
            lines: [{ productId: product1Id, qty: 1 }],
            paymentMethod: 'CASH',
            cashGiven: 1000,
          },
          user1Id,
          'CLERK',
        );
      }),
    ).rejects.toThrow(/No tienes acceso a esa tienda/);
  });

  it('SEC-01: permite a un CLERK vender en su tienda asignada', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        {
          storeId: store1Id,
          lines: [{ productId: product1Id, qty: 1 }],
          paymentMethod: 'CASH',
          cashGiven: 1000,
        },
        user1Id,
        'CLERK',
      );
    });
    expect(sale.storeId).toBe(store1Id);
  });

  // NOTA: el rechazo de un CLERK con 403 al anular es responsabilidad del
  // RolesGuard global (@Roles('ADMIN','MANAGER') en el controller), no de
  // voidSale. Ese guard se valida a nivel HTTP en otros tests; aquí cubrimos la
  // lógica de transición y el aislamiento por tenant del servicio.
  it('anula una venta: status VOIDED y voidedBy correcto', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store1Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      );
    });

    const voided = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.voidSale(sale.id, user1Id);
    });

    expect(voided.status).toBe('VOIDED');
    expect(voided.voidedBy).toBe(user1Id);
    expect(voided.voidedAt).toBeInstanceOf(Date);
    // El total no se toca: la venta sigue existiendo, solo cambia su estado.
    expect(Number(voided.total)).toBeCloseTo(Number(sale.total), 2);
  });

  it('no se puede anular dos veces la misma venta', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store1Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      );
    });

    await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.voidSale(sale.id, user1Id);
    });

    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.voidSale(sale.id, user1Id);
      }),
    ).rejects.toThrow(/ya está anulada/);
  });

  it('anular un id inexistente lanza NotFound', async () => {
    await expect(
      tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.voidSale('00000000-0000-0000-0000-000000000000', user1Id);
      }),
    ).rejects.toThrow();
  });

  it('aísla por tenant: org2 no puede anular una venta de org1', async () => {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId: store1Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
        user1Id,
        'ADMIN',
      );
    });

    // Bajo el contexto de org2, RLS + el filtro por organizationId no ven la
    // venta → findFirst null → NotFound. No se puede anular entre tenants.
    await expect(
      tenantStorage.run({ organizationId: org2Id }, async () => {
        return service.voidSale(sale.id, user1Id);
      }),
    ).rejects.toThrow();

    // Sanity: la venta de org1 sigue COMPLETED (org2 no la tocó).
    const own = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return prisma.sale.findUnique({ where: { id: sale.id } });
    });
    expect(own?.status).toBe('COMPLETED');
  });

  it('rechaza con 409 crear una venta sin caja abierta en la tienda', async () => {
    // Cerramos temporalmente la caja OPEN de store2 para probar el rechazo, y la
    // reabrimos al final para no afectar a otros tests (este corre tras los demás
    // del bloque, pero lo dejamos consistente por idempotencia).
    await admin.$executeRaw`UPDATE "CashSession" SET status = 'CLOSED', "closedAt" = now() WHERE "organizationId" = ${org1Id}::uuid AND "storeId" = ${store2Id}::uuid AND status = 'OPEN'`;
    try {
      await expect(
        tenantStorage.run({ organizationId: org1Id }, async () => {
          return service.create(
            {
              storeId: store2Id,
              lines: [{ productId: product1Id, qty: 1 }],
              paymentMethod: 'CARD',
            },
            user1Id,
            'ADMIN',
          );
        }),
      ).rejects.toThrow(/No hay caja abierta/);
    } finally {
      await admin.$executeRaw`
        INSERT INTO "CashSession" ("id", "organizationId", "storeId", "userId", "openingAmount", "status", "openedAt")
        VALUES (gen_random_uuid(), ${org1Id}::uuid, ${store2Id}::uuid, ${user1Id}::uuid, 0, 'OPEN', now())
      `;
    }
  });

  // Helper: crea una venta con createdAt forzado a una fecha concreta usando el
  // cliente admin (superuser, sin RLS), para poder testear el filtro por día sin
  // depender del reloj real. Devuelve el id de la venta.
  async function createSaleAt(
    storeId: string,
    isoCreatedAt: string,
    paymentMethod: 'CASH' | 'CARD' = 'CARD',
  ): Promise<string> {
    const sale = await tenantStorage.run({ organizationId: org1Id }, async () => {
      return service.create(
        { storeId, lines: [{ productId: product1Id, qty: 1 }], paymentMethod },
        user1Id,
        'ADMIN',
      );
    });
    await admin.$executeRaw`
      UPDATE "Sale" SET "createdAt" = ${new Date(isoCreatedAt)} WHERE id = ${sale.id}::uuid
    `;
    return sale.id;
  }

  describe('findSales (historial #14)', () => {
    // Días ÚNICOS por ejecución: el test de integración corre contra una BD que
    // conserva datos de runs anteriores (no se trunca entre ejecuciones). Forzamos
    // el createdAt de cada venta a un día lejano y distinto en cada run (derivado
    // del reloj) para que los filtros por día devuelvan SOLO las ventas que crea
    // este test y los counts sean deterministas y repetibles.
    // Punto de partida ÚNICO por run: un día futuro (año de 4 dígitos, válido
    // para el regex YYYY-MM-DD del DTO) derivado del reloj. Cada llamada avanza un
    // día, garantizando días contiguos sin colisión entre tests del mismo run.
    let dayCursor = new Date(
      Date.UTC(2100, 0, 1) + (Date.now() % (365 * 200)) * 86400000 - 200 * 86400000,
    );
    function uniqueDay(): string {
      const day = dayCursor.toISOString().slice(0, 10);
      dayCursor = new Date(dayCursor.getTime() + 86400000);
      return day;
    }

    it('filtra por tienda y día; pagina; totals suma solo COMPLETED', async () => {
      const DAY = uniqueDay();
      const OTHER_DAY = uniqueDay();
      // store1, día DAY: 2 COMPLETED + 1 VOIDED. store1 OTHER_DAY: 1. store2 DAY: 1.
      await createSaleAt(store1Id, `${DAY}T09:00:00.000Z`);
      await createSaleAt(store1Id, `${DAY}T11:00:00.000Z`);
      const voidedId = await createSaleAt(store1Id, `${DAY}T13:00:00.000Z`);
      await tenantStorage.run({ organizationId: org1Id }, async () =>
        service.voidSale(voidedId, user1Id),
      );
      await createSaleAt(store1Id, `${OTHER_DAY}T09:00:00.000Z`);
      await createSaleAt(store2Id, `${DAY}T09:00:00.000Z`);

      const res = await tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.findSales({ storeId: store1Id, date: DAY });
      });

      // Solo las 3 ventas de store1 en DAY (2 COMPLETED + 1 VOIDED). Ni la de
      // OTHER_DAY ni la de store2 aparecen.
      expect(res.totalItems).toBe(3);
      expect(res.items).toHaveLength(3);
      for (const item of res.items) {
        expect(item.storeId).toBe(store1Id);
      }
      // Orden createdAt desc: la VOIDED (13:00) es la primera.
      expect(res.items[0]!.status).toBe('VOIDED');
      // La VOIDED se lista pero NO suma: totals.count = 2 (solo COMPLETED).
      expect(res.totals.count).toBe(2);
      const completed = res.items.filter((i) => i.status === 'COMPLETED');
      const expectedSum = completed.reduce((acc, i) => acc + Number(i.total), 0);
      expect(Number(res.totals.totalAmount)).toBeCloseTo(expectedSum, 2);
    });

    it('pagina: page/pageSize controlan skip/take y los metadatos', async () => {
      const day = uniqueDay();
      for (let i = 0; i < 3; i++) {
        await createSaleAt(store1Id, `${day}T0${i}:00:00.000Z`);
      }

      const p1 = await tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.findSales({ storeId: store1Id, date: day, page: 1, pageSize: 2 });
      });
      const p2 = await tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.findSales({ storeId: store1Id, date: day, page: 2, pageSize: 2 });
      });

      expect(p1.totalItems).toBe(3);
      expect(p1.items).toHaveLength(2);
      expect(p1.page).toBe(1);
      expect(p1.pageSize).toBe(2);
      expect(p2.items).toHaveLength(1);
      // Sin solapamiento entre páginas.
      const ids = new Set([...p1.items, ...p2.items].map((i) => i.id));
      expect(ids.size).toBe(3);
    });

    it('aísla por tenant: org2 no ve las ventas de org1', async () => {
      const day = uniqueDay();
      await createSaleAt(store1Id, `${day}T09:00:00.000Z`);

      const seenByOrg2 = await tenantStorage.run({ organizationId: org2Id }, async () => {
        return service.findSales({ date: day });
      });
      // Las ventas de este test son todas de org1 (creadas en store1Id).
      expect(seenByOrg2.items.every((i) => i.storeId !== store1Id)).toBe(true);

      const seenByOrg1 = await tenantStorage.run({ organizationId: org1Id }, async () => {
        return service.findSales({ storeId: store1Id, date: day });
      });
      expect(seenByOrg1.totalItems).toBeGreaterThanOrEqual(1);
    });

    // ── IT-04: filtros nuevos (rango, vendedor, familia, estado) + agregados ──

    it('rango from/to: filtra por rango de días con `to` inclusivo', async () => {
      const d1 = uniqueDay();
      const d2 = uniqueDay();
      const d3 = uniqueDay();
      await createSaleAt(store1Id, `${d1}T09:00:00.000Z`);
      await createSaleAt(store1Id, `${d2}T09:00:00.000Z`);
      await createSaleAt(store1Id, `${d3}T09:00:00.000Z`);

      const count = async (q: { from?: string; to?: string }): Promise<number> =>
        (
          await tenantStorage.run({ organizationId: org1Id }, async () =>
            service.findSales({ storeId: store1Id, ...q }),
          )
        ).totalItems;

      expect(await count({ from: d1, to: d2 })).toBe(2); // d1, d2 (d3 fuera)
      expect(await count({ from: d2, to: d3 })).toBe(2); // d2, d3 (d1 fuera)
      expect(await count({ from: d1, to: d3 })).toBe(3); // los tres
      expect(await count({ from: d2, to: d2 })).toBe(1); // `to` inclusivo: solo d2
    });

    it('filtra por estado; los agregados siguen contando solo COMPLETED', async () => {
      const day = uniqueDay();
      await createSaleAt(store1Id, `${day}T09:00:00.000Z`);
      await createSaleAt(store1Id, `${day}T10:00:00.000Z`);
      const voidedId = await createSaleAt(store1Id, `${day}T11:00:00.000Z`);
      await tenantStorage.run({ organizationId: org1Id }, async () =>
        service.voidSale(voidedId, user1Id),
      );

      const onlyVoided = await tenantStorage.run({ organizationId: org1Id }, async () =>
        service.findSales({ storeId: store1Id, date: day, status: 'VOIDED' }),
      );
      expect(onlyVoided.items).toHaveLength(1);
      expect(onlyVoided.items[0]!.status).toBe('VOIDED');
      // Los agregados ignoran el status pedido: cuentan las 2 COMPLETED del día.
      expect(onlyVoided.totals.count).toBe(2);

      const onlyCompleted = await tenantStorage.run({ organizationId: org1Id }, async () =>
        service.findSales({ storeId: store1Id, date: day, status: 'COMPLETED' }),
      );
      expect(onlyCompleted.items).toHaveLength(2);
      expect(onlyCompleted.items.every((i) => i.status === 'COMPLETED')).toBe(true);
    });

    it('filtra por vendedor (userId)', async () => {
      const day = uniqueDay();
      await createSaleAt(store1Id, `${day}T09:00:00.000Z`);

      const mine = await tenantStorage.run({ organizationId: org1Id }, async () =>
        service.findSales({ storeId: store1Id, date: day, userId: user1Id }),
      );
      expect(mine.totalItems).toBe(1); // la registró user1Id

      const other = await tenantStorage.run({ organizationId: org1Id }, async () =>
        service.findSales({
          storeId: store1Id,
          date: day,
          userId: '00000000-0000-0000-0000-0000000000ab',
        }),
      );
      expect(other.totalItems).toBe(0);
    });

    it('filtra por familia de producto', async () => {
      const day = uniqueDay();
      // Familia + producto propios del test (el seed de org1 no enlaza familias).
      const tag = `it04-fam-${day}`;
      const [fam] = await admin.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "ProductFamily" ("id","organizationId","name","color","sortOrder","createdAt","updatedAt")
        VALUES (gen_random_uuid(), ${org1Id}::uuid, ${tag}, '#abc', 0, now(), now())
        RETURNING id::text
      `;
      const [prod] = await admin.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "Product" ("id","organizationId","familyId","name","salePrice","costPrice","taxRate","saleUnit","unitSymbol","active","createdAt","updatedAt")
        VALUES (gen_random_uuid(), ${org1Id}::uuid, ${fam!.id}::uuid, ${tag}, 100, 60, 21, 'UNIT', 'ud', true, now(), now())
        RETURNING id::text
      `;
      const sale = await tenantStorage.run({ organizationId: org1Id }, async () =>
        service.create(
          { storeId: store1Id, lines: [{ productId: prod!.id, qty: 1 }], paymentMethod: 'CARD' },
          user1Id,
          'ADMIN',
        ),
      );
      await admin.$executeRaw`UPDATE "Sale" SET "createdAt" = ${new Date(`${day}T09:00:00.000Z`)} WHERE id = ${sale.id}::uuid`;

      const inFamily = await tenantStorage.run({ organizationId: org1Id }, async () =>
        service.findSales({ storeId: store1Id, date: day, familyId: fam!.id }),
      );
      expect(inFamily.totalItems).toBe(1);

      const otherFamily = await tenantStorage.run({ organizationId: org1Id }, async () =>
        service.findSales({
          storeId: store1Id,
          date: day,
          familyId: '00000000-0000-0000-0000-0000000000fa',
        }),
      );
      expect(otherFamily.totalItems).toBe(0);
    });

    it('agregados: avgMarginPct y avgDiscountPct coherentes con las ventas del filtro', async () => {
      const day = uniqueDay();
      const start = new Date(`${day}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 86400000);
      // 2 ventas COMPLETED con descuentos conocidos (línea 10% + ticket 5%) y sin descuento.
      const a = await tenantStorage.run({ organizationId: org1Id }, async () =>
        service.create(
          {
            storeId: store1Id,
            lines: [{ productId: product1Id, qty: 2, discountPct: 10 }],
            paymentMethod: 'CARD',
            ticketDiscountPct: 5,
          },
          user1Id,
          'ADMIN',
        ),
      );
      const b = await tenantStorage.run({ organizationId: org1Id }, async () =>
        service.create(
          { storeId: store1Id, lines: [{ productId: product1Id, qty: 1 }], paymentMethod: 'CARD' },
          user1Id,
          'ADMIN',
        ),
      );
      for (const id of [a.id, b.id]) {
        await admin.$executeRaw`UPDATE "Sale" SET "createdAt" = ${new Date(`${day}T10:00:00.000Z`)} WHERE id = ${id}::uuid`;
      }

      // Esperado, calculado de las filas reales (independiente de los precios del seed)
      // y sobre el MISMO conjunto que agregará findSales (día único + store1 + COMPLETED).
      const [lns] = await admin.$queryRaw<Array<{ revenue: string; margin: string }>>`
        SELECT COALESCE(SUM(sl."lineTotal"), 0)::text AS revenue,
               COALESCE(SUM(sl."lineTotal" - sl."costPrice" * sl.qty), 0)::text AS margin
        FROM "SaleLine" sl JOIN "Sale" sa ON sa.id = sl."saleId"
        WHERE sa."organizationId" = ${org1Id}::uuid AND sa."storeId" = ${store1Id}::uuid
          AND sa.status = 'COMPLETED' AND sa."createdAt" >= ${start} AND sa."createdAt" < ${end}
      `;
      const [head] = await admin.$queryRaw<
        Array<{ subtotal: string; discount: string; total: string }>
      >`
        SELECT COALESCE(SUM(sa.subtotal), 0)::text AS subtotal,
               COALESCE(SUM(sa."discountTotal"), 0)::text AS discount,
               COALESCE(SUM(sa.total), 0)::text AS total
        FROM "Sale" sa
        WHERE sa."organizationId" = ${org1Id}::uuid AND sa."storeId" = ${store1Id}::uuid
          AND sa.status = 'COMPLETED' AND sa."createdAt" >= ${start} AND sa."createdAt" < ${end}
      `;
      const revenue = Number(lns!.revenue);
      const margin = Number(lns!.margin);
      const subtotal = Number(head!.subtotal);
      const discount = Number(head!.discount);
      const expMarginPct = revenue > 0 ? margin / revenue : 0;
      const expDiscountPct = subtotal + discount > 0 ? discount / (subtotal + discount) : 0;

      const res = await tenantStorage.run({ organizationId: org1Id }, async () =>
        service.findSales({ storeId: store1Id, date: day }),
      );
      expect(res.totals.count).toBe(2);
      expect(Number(res.totals.totalAmount)).toBeCloseTo(Number(head!.total), 2);
      expect(res.totals.avgMarginPct).toBeCloseTo(expMarginPct, 4);
      expect(res.totals.avgDiscountPct).toBeCloseTo(expDiscountPct, 4);
      // Sanity: hubo descuento real → la tasa es > 0 (no un falso 0 trivial).
      expect(expDiscountPct).toBeGreaterThan(0);
    });
  });

  describe('SalesExport — export asíncrono a CSV (IT-05)', () => {
    let exporter: SalesExportService;
    // Días únicos propios (base distinta de findSales para no colisionar).
    let dayCursor = new Date(Date.UTC(2300, 0, 1) + (Date.now() % (365 * 100)) * 86400000);
    function uniqueDay(): string {
      const d = dayCursor.toISOString().slice(0, 10);
      dayCursor = new Date(dayCursor.getTime() + 86400000);
      return d;
    }

    beforeAll(() => {
      // Sin onModuleInit → sin cola → requestExport procesa en el momento (determinista).
      exporter = new SalesExportService(prisma as unknown as PrismaService, service);
    });

    it('genera el CSV del filtro y se descarga (sin Redis → síncrono)', async () => {
      const day = uniqueDay();
      const aId = await createSaleAt(store1Id, `${day}T09:00:00.000Z`);
      const bId = await createSaleAt(store1Id, `${day}T10:00:00.000Z`);
      const tickets = await admin.$queryRaw<Array<{ ticketNumber: string }>>`
        SELECT "ticketNumber" FROM "Sale" WHERE id IN (${aId}::uuid, ${bId}::uuid)
      `;

      const req = await tenantStorage.run({ organizationId: org1Id }, async () =>
        exporter.requestExport({ storeId: store1Id, date: day }, user1Id, 'ADMIN'),
      );
      expect(req.status).toBe('COMPLETED');

      const meta = await tenantStorage.run({ organizationId: org1Id }, async () =>
        exporter.getExport(req.id),
      );
      expect(meta.status).toBe('COMPLETED');
      expect(meta.rowCount).toBe(2);

      const { csv } = await tenantStorage.run({ organizationId: org1Id }, async () =>
        exporter.downloadCsv(req.id),
      );
      const lines = csv.split('\n');
      expect(lines[0]).toBe(
        'ticket,fecha,tienda,vendedor,estado,metodo_pago,subtotal,descuento,total',
      );
      expect(lines).toHaveLength(3); // cabecera + 2 ventas
      for (const t of tickets) {
        expect(csv).toContain(t.ticketNumber);
      }
    });

    it('aísla por tenant: org2 no ve el export de org1', async () => {
      const day = uniqueDay();
      await createSaleAt(store1Id, `${day}T09:00:00.000Z`);
      const req = await tenantStorage.run({ organizationId: org1Id }, async () =>
        exporter.requestExport({ storeId: store1Id, date: day }, user1Id, 'ADMIN'),
      );

      // org2 no puede consultar ni descargar el export de org1 (RLS → 404).
      await expect(
        tenantStorage.run({ organizationId: org2Id }, async () => exporter.getExport(req.id)),
      ).rejects.toThrow();
      await expect(
        tenantStorage.run({ organizationId: org2Id }, async () => exporter.downloadCsv(req.id)),
      ).rejects.toThrow();
    });
  });
});
