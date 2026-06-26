// Extras del seed DEMO: completa los modelos que seed-demo.ts no cubría para
// que TODAS las vistas del TPV y el backoffice tengan datos (traspasos,
// devoluciones, movimientos de caja, pausas de fichaje, dispositivos, ventas
// anuladas/con descuento, alertas LOW_STOCK, pedidos recibidos, B2B en todos
// los estados, VeriFactu pendiente/fallido, exports, API keys, PINs, auditoría).
// Todas las funciones son idempotentes (marker en notes/ticket o upsert).
// Helpers de fecha duplicados a propósito: cada seed es autocontenido.

import { createHash } from 'node:crypto';

import bcrypt from 'bcryptjs';

import {
  AlertType,
  CashMovementType,
  DiscountSource,
  MovementType,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  PurchaseOrderStatus,
  SaleChannel,
  SalesExportStatus,
  SaleStatus,
  SaleUnit,
  TimeClockType,
  TransferStatus,
  UserRole,
  VerifactuStatus,
  VerifactuType,
  WholesaleOrderStatus,
} from '../generated/client/index.js';

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

/** Suma `delta` al stock de (producto, tienda) sin dejarlo negativo. */
async function applyStockDelta(
  prisma: PrismaClient,
  productId: string,
  storeId: string,
  delta: number,
): Promise<void> {
  const stock = await prisma.stock.findUnique({
    where: { productId_storeId: { productId, storeId } },
  });
  if (!stock) return;
  const newQty = Math.max(0, Number(stock.quantity) + delta);
  await prisma.stock.update({
    where: { productId_storeId: { productId, storeId } },
    data: { quantity: newQty },
  });
}

async function productByName(
  prisma: PrismaClient,
  orgId: string,
  name: string,
): Promise<{ id: string; salePrice: number; costPrice: number; taxRate: number } | null> {
  const p = await prisma.product.findFirst({ where: { organizationId: orgId, name } });
  if (!p) return null;
  return {
    id: p.id,
    salePrice: Number(p.salePrice),
    costPrice: Number(p.costPrice),
    taxRate: Number(p.taxRate),
  };
}

async function storeByCode(
  prisma: PrismaClient,
  orgId: string,
  code: string,
): Promise<{ id: string; code: string } | null> {
  const s = await prisma.store.findFirst({ where: { organizationId: orgId, code } });
  return s ? { id: s.id, code: s.code } : null;
}

// ─── Catálogo: descripciones, SKU y venta a granel ───────────────────────────

const PRODUCT_DETAILS: Record<string, { description: string; weight?: boolean }> = {
  'Aceite CBD 10% — Beemine': {
    description: 'Aceite sublingual 10% CBD full spectrum, 10 ml. Cultivo ecológico certificado.',
  },
  'Aceite CBD 10% Premium — Profesor CBD': {
    description: 'Fórmula premium 10% con terpenos añadidos, 10 ml. Sabor natural.',
  },
  'Aceite CBD 10% — Cannactiva': {
    description: 'Aceite de CBD 10% con base de MCT, 10 ml. Análisis de laboratorio incluido.',
  },
  'Aceite CBD 20% — Beemine': {
    description: 'Concentración alta 20% CBD, 10 ml. Recomendado para usuarios habituales.',
  },
  'Aceite CBD 20% — Profesor CBD': {
    description: 'Aceite 20% espectro completo, 10 ml. Extracción CO2 supercrítico.',
  },
  'Aceite de cáñamo alimentario — Beemine': {
    description: 'Aceite de semilla de cáñamo prensado en frío, 250 ml. Uso culinario.',
  },
  'Aceite de cáñamo alimentario — Cannactiva': {
    description: 'Aceite alimentario de cáñamo virgen, 250 ml. Rico en omega 3 y 6.',
  },
  'Aceite CBD 5%': {
    description: 'Aceite de iniciación 5% CBD, 10 ml. Ideal para primeras tomas.',
  },
  'Aceite CBD + Melatonina': {
    description: 'Aceite 5% CBD con 1 mg de melatonina por dosis. Formato noche, 10 ml.',
  },
  'Cápsulas CBD 30u': {
    description: 'Cápsulas vegetales de 10 mg de CBD, bote de 30. Sin sabor.',
  },
  'Flor CBD Lemon Haze 20%': {
    description: 'Flor aromática cítrica, 20% CBD. Venta a granel por gramos.',
    weight: true,
  },
  'Flor Lemon Haze 5g — CBD Valley': {
    description: 'Formato bolsa sellada de 5 g, Lemon Haze seleccionada.',
  },
  'Flor CBD OG Kush 22%': {
    description: 'Clásica OG Kush con 22% CBD, aroma terroso. Venta a granel por gramos.',
    weight: true,
  },
  'Flor OG Kush — Mountain Grow': {
    description: 'OG Kush de cultivo alpino indoor, bolsa de 3 g.',
  },
  'Flor CBD Amnesia 18%': {
    description: 'Amnesia 18% CBD de invernadero. Venta a granel por gramos.',
    weight: true,
  },
  'Flor CBD Gorilla 15%': {
    description: 'Gorilla Glue 15% CBD, flor densa y resinosa. Venta a granel por gramos.',
    weight: true,
  },
  'Hash CBD Maroc': {
    description: 'Resina prensada estilo marroquí, 30% CBD. Venta a granel por gramos.',
    weight: true,
  },
  'Pre-roll CBD x3': {
    description: 'Pack de 3 pre-rolls de flor CBD con boquilla de cartón.',
  },
  'Crema CBD 3% — Beemine': {
    description: 'Crema corporal 3% CBD con caléndula, 50 ml. Piel sensible.',
  },
  'Crema CBD 3% — Cannactiva': {
    description: 'Crema hidratante 3% CBD con aloe vera, 50 ml.',
  },
  'Crema CBD facial': {
    description: 'Crema facial antiedad con CBD y ácido hialurónico, 30 ml.',
  },
  'Crema CBD muscular': {
    description: 'Gel muscular efecto frío-calor con CBD y árnica, 100 ml.',
  },
  'Champú CBD': {
    description: 'Champú fortificante con aceite de cáñamo, 250 ml. Uso diario.',
  },
  'Bálsamo labial CBD': {
    description: 'Bálsamo labial reparador con CBD y manteca de karité.',
  },
  'Sérum CBD': {
    description: 'Sérum facial concentrado con CBD y vitamina C, 30 ml.',
  },
  'Grinder metálico': {
    description: 'Grinder de aluminio CNC de 4 piezas con tamiz, 50 mm.',
  },
  'Papel de liar x5': {
    description: 'Pack de 5 libritos de papel orgánico sin blanquear, tamaño king size.',
  },
  'Filtros x100': { description: 'Bolsa de 100 filtros de cartón reciclado, 6 mm.' },
  'Bolsa hermética': { description: 'Bolsa antiolor con cierre zip y bloqueo UV, 1 L.' },
  'Bote cristal UV': { description: 'Bote de vidrio violeta con protección UV, 100 ml.' },
  'Mechero recargable': { description: 'Mechero electrónico USB-C resistente al viento.' },
  'Bandeja liar': { description: 'Bandeja metálica antiarañazos con bordes curvos, 27×16 cm.' },
  'Camiseta marca': { description: 'Camiseta algodón orgánico 180 g con logo bordado.' },
  'Vaporizador portátil': {
    description: 'Vaporizador de hierba seca con control de temperatura, batería 2200 mAh.',
  },
};

/** Añade descripción a todos los productos y pasa las flores a granel (g). */
async function seedProductDetails(prisma: PrismaClient, orgId: string): Promise<void> {
  const products = await prisma.product.findMany({ where: { organizationId: orgId } });
  for (const p of products) {
    const detail = PRODUCT_DETAILS[p.name];
    if (!detail) continue;
    const wantUnit = detail.weight ? SaleUnit.WEIGHT : SaleUnit.UNIT;
    const wantSymbol = detail.weight ? 'g' : 'ud';
    if (p.description === detail.description && p.saleUnit === wantUnit) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: { description: detail.description, saleUnit: wantUnit, unitSymbol: wantSymbol },
    });
  }
}

// ─── Usuarios: PIN de autorización (devoluciones sin ticket, fichaje) ─────────

const USER_PINS: Record<string, string> = {
  'admin@demo.simpletpv': '1111',
  'manager@demo.simpletpv': '2222',
  'clerk@demo.simpletpv': '3333',
  'jon@demo.simpletpv': '4444',
};

async function seedUserPins(prisma: PrismaClient, orgId: string): Promise<void> {
  for (const [email, pin] of Object.entries(USER_PINS)) {
    const user = await prisma.user.findFirst({ where: { organizationId: orgId, email } });
    if (!user || user.pinHash) continue;
    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash: await bcrypt.hash(pin, 10) },
    });
  }
}

// ─── Tiendas: estado operativo manual (D-10) ─────────────────────────────────

async function seedStoreOps(prisma: PrismaClient, orgId: string): Promise<void> {
  const opsByCode: Record<string, { verified: boolean; incident: string | null }> = {
    '01': { verified: true, incident: null },
    '02': { verified: true, incident: null },
    '03': { verified: false, incident: 'Impresora de tickets atascada — técnico avisado' },
    '04': { verified: true, incident: null },
    '05': { verified: false, incident: null },
  };
  for (const [code, ops] of Object.entries(opsByCode)) {
    const store = await storeByCode(prisma, orgId, code);
    if (!store) continue;
    await prisma.store.update({
      where: { id: store.id },
      data: { opsVerified: ops.verified, opsIncident: ops.incident, opsUpdatedAt: new Date() },
    });
  }
}

// ─── Dispositivos oficiales (emparejados, pendientes, sin conexión) ──────────

async function seedDevices(prisma: PrismaClient, orgId: string): Promise<void> {
  // OJO: nada en la tienda Sur (03): el e2e del backoffice (pages.spec #100/I-08)
  // genera y revoca tokens en Sur y asume que empieza SIN dispositivos.
  const devices = [
    { token: 'demo-pair-01-a', code: '01', name: 'TPV Mostrador 1', auth: true, seenMin: 3 },
    { token: 'demo-pair-01-b', code: '01', name: 'TPV Mostrador 2', auth: true, seenMin: 4320 },
    { token: 'demo-pair-02-a', code: '02', name: 'TPV Norte Caja', auth: true, seenMin: 8 },
    { token: 'demo-pair-05-a', code: '05', name: 'Tablet Online', auth: false, seenMin: null },
    { token: 'demo-pair-04-a', code: '04', name: 'TPV Gran Vía', auth: true, seenMin: 45 },
  ];
  for (const d of devices) {
    const store = await storeByCode(prisma, orgId, d.code);
    if (!store) continue;
    const lastSeenAt = d.seenMin === null ? null : new Date(Date.now() - d.seenMin * 60_000);
    const pairedAt = d.auth ? dateDaysAgo(30, 10, 0) : null;
    await prisma.officialDevice.upsert({
      where: { pairingToken: d.token },
      update: { lastSeenAt },
      create: {
        organizationId: orgId,
        storeId: store.id,
        name: d.name,
        pairingToken: d.token,
        authorized: d.auth,
        pairedAt,
        lastSeenAt,
      },
    });
  }
}

// ─── Traspasos entre tiendas (los 4 estados del flujo) ───────────────────────

interface TransferSpec {
  marker: string;
  originCode: string;
  destCode: string;
  status: TransferStatus;
  createdDaysAgo: number;
  sentDaysAgo: number | null;
  receivedDaysAgo: number | null;
  closedDaysAgo: number | null;
  lines: Array<{ product: string; sent: number; received?: number; note?: string }>;
}

const TRANSFERS: TransferSpec[] = [
  {
    marker: 'Reposición semanal Centro → Norte',
    originCode: '01',
    destCode: '02',
    status: TransferStatus.CLOSED,
    createdDaysAgo: 12,
    sentDaysAgo: 11,
    receivedDaysAgo: 9,
    closedDaysAgo: 9,
    lines: [
      { product: 'Papel de liar x5', sent: 10, received: 10 },
      { product: 'Pre-roll CBD x3', sent: 6, received: 5, note: 'Unidad dañada en transporte' },
    ],
  },
  {
    marker: 'Refuerzo fin de semana Sur',
    originCode: '01',
    destCode: '03',
    status: TransferStatus.RECEIVED,
    createdDaysAgo: 5,
    sentDaysAgo: 4,
    receivedDaysAgo: 2,
    closedDaysAgo: null,
    lines: [
      { product: 'Filtros x100', sent: 8, received: 8 },
      { product: 'Mechero recargable', sent: 6, received: 6 },
    ],
  },
  {
    marker: 'Material promoción Gran Vía',
    originCode: '02',
    destCode: '04',
    status: TransferStatus.SENT,
    createdDaysAgo: 2,
    sentDaysAgo: 1,
    receivedDaysAgo: null,
    closedDaysAgo: null,
    lines: [
      { product: 'Bálsamo labial CBD', sent: 5 },
      { product: 'Grinder metálico', sent: 4 },
    ],
  },
  {
    marker: 'Borrador reparto Online',
    originCode: '01',
    destCode: '05',
    status: TransferStatus.DRAFT,
    createdDaysAgo: 0,
    sentDaysAgo: null,
    receivedDaysAgo: null,
    closedDaysAgo: null,
    lines: [
      { product: 'Papel de liar x5', sent: 12 },
      { product: 'Filtros x100', sent: 10 },
      { product: 'Pre-roll CBD x3', sent: 8 },
    ],
  },
];

async function seedTransfers(prisma: PrismaClient, orgId: string): Promise<void> {
  const admin = await prisma.user.findFirst({
    where: { organizationId: orgId, role: UserRole.ADMIN },
  });
  if (!admin) return;

  for (const t of TRANSFERS) {
    const existing = await prisma.transfer.findFirst({
      where: { organizationId: orgId, notes: t.marker },
    });
    if (existing) continue;

    const origin = await storeByCode(prisma, orgId, t.originCode);
    const dest = await storeByCode(prisma, orgId, t.destCode);
    if (!origin || !dest) continue;

    const lines: Array<{
      productId: string;
      sent: number;
      received: number | null;
      note: string | null;
    }> = [];
    for (const l of t.lines) {
      const product = await productByName(prisma, orgId, l.product);
      if (!product) continue;
      lines.push({
        productId: product.id,
        sent: l.sent,
        received: l.received ?? null,
        note: l.note ?? null,
      });
    }
    if (lines.length === 0) continue;

    const wasSent = t.sentDaysAgo !== null;
    const wasReceived = t.receivedDaysAgo !== null;

    const transfer = await prisma.transfer.create({
      data: {
        organizationId: orgId,
        originStoreId: origin.id,
        destStoreId: dest.id,
        status: t.status,
        notes: t.marker,
        createdBy: admin.id,
        createdAt: dateDaysAgo(t.createdDaysAgo, 10, 0),
        sentAt: wasSent ? dateDaysAgo(t.sentDaysAgo!, 12, 0) : null,
        receivedAt: wasReceived ? dateDaysAgo(t.receivedDaysAgo!, 11, 0) : null,
        closedAt: t.closedDaysAgo !== null ? dateDaysAgo(t.closedDaysAgo, 18, 0) : null,
        lines: {
          create: lines.map((l) => ({
            organizationId: orgId,
            productId: l.productId,
            quantitySent: l.sent,
            quantityReceived: wasReceived ? (l.received ?? l.sent) : null,
            discrepancy: wasReceived && l.received !== null ? l.received - l.sent : null,
            discrepancyNote: l.note,
          })),
        },
      },
    });

    // Efectos en stock + rastro de movimientos, como hace TransfersService.
    for (const l of lines) {
      if (wasSent) {
        await applyStockDelta(prisma, l.productId, origin.id, -l.sent);
        await prisma.stockMovement.create({
          data: {
            organizationId: orgId,
            productId: l.productId,
            storeId: origin.id,
            userId: admin.id,
            type: MovementType.TRANSFER_OUT,
            quantity: -l.sent,
            referenceId: transfer.id,
            createdAt: dateDaysAgo(t.sentDaysAgo!, 12, 0),
          },
        });
      }
      if (wasReceived) {
        const received = l.received ?? l.sent;
        await applyStockDelta(prisma, l.productId, dest.id, received);
        await prisma.stockMovement.create({
          data: {
            organizationId: orgId,
            productId: l.productId,
            storeId: dest.id,
            userId: admin.id,
            type: MovementType.TRANSFER_IN,
            quantity: received,
            referenceId: transfer.id,
            createdAt: dateDaysAgo(t.receivedDaysAgo!, 11, 0),
          },
        });
      }
    }
  }
}

// ─── Devoluciones (con ticket y sin ticket autorizada por PIN) ───────────────

async function seedReturns(prisma: PrismaClient, orgId: string): Promise<void> {
  const existing = await prisma.return.count({ where: { organizationId: orgId } });
  if (existing > 0) return;

  const clerk = await prisma.user.findFirst({
    where: { organizationId: orgId, role: UserRole.CLERK },
  });
  const manager = await prisma.user.findFirst({
    where: { organizationId: orgId, role: UserRole.MANAGER },
  });
  if (!clerk || !manager) return;

  // R1: devolución parcial CON ticket de una venta en efectivo de hoy (entra en
  // la caja abierta → el cierre del turno la descontará, igual que en producción).
  const store01 = await storeByCode(prisma, orgId, '01');
  if (store01) {
    const sale = await prisma.sale.findFirst({
      where: {
        organizationId: orgId,
        storeId: store01.id,
        status: SaleStatus.COMPLETED,
        paymentMethod: PaymentMethod.CASH,
      },
      orderBy: { createdAt: 'desc' },
      include: { lines: { take: 1 } },
    });
    const line = sale?.lines[0];
    if (sale && line) {
      const unitNet = round2(Number(line.lineTotal) / Number(line.qty));
      const ret = await prisma.return.create({
        data: {
          organizationId: orgId,
          storeId: store01.id,
          userId: clerk.id,
          saleId: sale.id,
          reason: 'Producto defectuoso',
          total: unitNet,
          createdAt: dateDaysAgo(0, 11, 30),
          lines: {
            create: [
              {
                organizationId: orgId,
                saleLineId: line.id,
                productId: line.productId,
                qty: 1,
                lineTotal: unitNet,
              },
            ],
          },
        },
      });
      await applyStockDelta(prisma, line.productId, store01.id, 1);
      await prisma.stockMovement.create({
        data: {
          organizationId: orgId,
          productId: line.productId,
          storeId: store01.id,
          userId: clerk.id,
          type: MovementType.RETURN,
          quantity: 1,
          referenceId: ret.id,
          createdAt: dateDaysAgo(0, 11, 30),
        },
      });
    }
  }

  // R2: devolución CON ticket de una venta con tarjeta de hace 3 días (sin
  // impacto en cierres de caja ya congelados, porque no es efectivo).
  const store02 = await storeByCode(prisma, orgId, '02');
  if (store02) {
    const sale = await prisma.sale.findFirst({
      where: {
        organizationId: orgId,
        storeId: store02.id,
        status: SaleStatus.COMPLETED,
        paymentMethod: PaymentMethod.CARD,
        createdAt: { lt: dateDaysAgo(3, 23, 59) },
      },
      orderBy: { createdAt: 'desc' },
      include: { lines: { take: 1 } },
    });
    const line = sale?.lines[0];
    if (sale && line) {
      const unitNet = round2(Number(line.lineTotal) / Number(line.qty));
      const ret = await prisma.return.create({
        data: {
          organizationId: orgId,
          storeId: store02.id,
          userId: manager.id,
          saleId: sale.id,
          reason: 'Cambio de opinión — formato equivocado',
          total: unitNet,
          createdAt: dateDaysAgo(3, 18, 0),
          lines: {
            create: [
              {
                organizationId: orgId,
                saleLineId: line.id,
                productId: line.productId,
                qty: 1,
                lineTotal: unitNet,
              },
            ],
          },
        },
      });
      await applyStockDelta(prisma, line.productId, store02.id, 1);
      await prisma.stockMovement.create({
        data: {
          organizationId: orgId,
          productId: line.productId,
          storeId: store02.id,
          userId: manager.id,
          type: MovementType.RETURN,
          quantity: 1,
          referenceId: ret.id,
          createdAt: dateDaysAgo(3, 18, 0),
        },
      });
    }
  }

  // R3: devolución SIN ticket (saleId null) autorizada por PIN de la encargada.
  const grinder = await productByName(prisma, orgId, 'Grinder metálico');
  if (store01 && grinder) {
    const ret = await prisma.return.create({
      data: {
        organizationId: orgId,
        storeId: store01.id,
        userId: clerk.id,
        saleId: null,
        authorizedBy: manager.id,
        reason: 'Sin ticket — cliente habitual, autorizada por encargada',
        total: grinder.salePrice,
        createdAt: dateDaysAgo(0, 12, 15),
        lines: {
          create: [
            {
              organizationId: orgId,
              saleLineId: null,
              productId: grinder.id,
              qty: 1,
              lineTotal: grinder.salePrice,
            },
          ],
        },
      },
    });
    await applyStockDelta(prisma, grinder.id, store01.id, 1);
    await prisma.stockMovement.create({
      data: {
        organizationId: orgId,
        productId: grinder.id,
        storeId: store01.id,
        userId: clerk.id,
        type: MovementType.RETURN,
        quantity: 1,
        referenceId: ret.id,
        createdAt: dateDaysAgo(0, 12, 15),
      },
    });
  }
}

// ─── Movimientos de caja (entradas/salidas del turno) ────────────────────────

async function seedCashMovements(prisma: PrismaClient, orgId: string): Promise<void> {
  const manager = await prisma.user.findFirst({
    where: { organizationId: orgId, role: UserRole.MANAGER },
  });
  if (!manager) return;

  const todayMovs: Record<
    string,
    Array<{ type: CashMovementType; amount: number; reason: string; hour: number; minute: number }>
  > = {
    '01': [
      {
        type: CashMovementType.IN,
        amount: 50,
        reason: 'Cambio adicional de banco',
        hour: 10,
        minute: 5,
      },
      {
        type: CashMovementType.OUT,
        amount: 120.45,
        reason: 'Pago a proveedor contra reembolso',
        hour: 12,
        minute: 40,
      },
      {
        type: CashMovementType.OUT,
        amount: 200,
        reason: 'Retirada parcial a caja fuerte',
        hour: 14,
        minute: 20,
      },
    ],
    '02': [
      { type: CashMovementType.IN, amount: 20, reason: 'Aporte de cambio', hour: 9, minute: 30 },
      {
        type: CashMovementType.OUT,
        amount: 35.5,
        reason: 'Material de limpieza',
        hour: 13,
        minute: 10,
      },
    ],
  };

  for (const [code, movs] of Object.entries(todayMovs)) {
    const store = await storeByCode(prisma, orgId, code);
    if (!store) continue;
    const session = await prisma.cashSession.findFirst({
      where: { organizationId: orgId, storeId: store.id, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
    if (!session) continue;
    const already = await prisma.cashMovement.count({
      where: { organizationId: orgId, cashSessionId: session.id },
    });
    if (already > 0) continue;
    for (const m of movs) {
      await prisma.cashMovement.create({
        data: {
          organizationId: orgId,
          cashSessionId: session.id,
          storeId: store.id,
          userId: manager.id,
          type: m.type,
          amount: m.amount,
          reason: m.reason,
          // Movimientos directos del encargado: nacen APPROVED y cuentan en el
          // cuadre (#146), igual que el alta directa del servicio.
          status: 'APPROVED',
          requestedById: manager.id,
          reviewedById: manager.id,
          reviewedAt: dateDaysAgo(0, m.hour, m.minute),
          createdAt: dateDaysAgo(0, m.hour, m.minute),
        },
      });
    }
  }

  // Sesión CERRADA de ayer en la tienda 01 con una retirada y un pequeño
  // descuadre (-3,50 €): recalculamos el esperado/contado para que el cierre
  // siga la misma fórmula que CashSessionsService (apertura + efectivo + neto).
  const store01 = await storeByCode(prisma, orgId, '01');
  if (!store01) return;
  const closed = await prisma.cashSession.findFirst({
    where: {
      organizationId: orgId,
      storeId: store01.id,
      status: 'CLOSED',
      openedAt: { gte: dateDaysAgo(1, 0, 0), lt: dateDaysAgo(0, 0, 0) },
    },
  });
  if (!closed || closed.expectedAmount === null) return;
  const hasMov = await prisma.cashMovement.count({
    where: { organizationId: orgId, cashSessionId: closed.id },
  });
  if (hasMov > 0) return;
  await prisma.cashMovement.create({
    data: {
      organizationId: orgId,
      cashSessionId: closed.id,
      storeId: store01.id,
      userId: manager.id,
      type: CashMovementType.OUT,
      amount: 150,
      reason: 'Retirada a banco',
      // APPROVED para que cuente en el cuadre del cierre (#146).
      status: 'APPROVED',
      requestedById: manager.id,
      reviewedById: manager.id,
      reviewedAt: dateDaysAgo(1, 19, 45),
      createdAt: dateDaysAgo(1, 19, 45),
    },
  });
  const newExpected = round2(Number(closed.expectedAmount) - 150);
  await prisma.cashSession.update({
    where: { id: closed.id },
    data: {
      expectedAmount: newExpected,
      closingAmount: round2(newExpected - 3.5),
      difference: -3.5,
    },
  });
}

// ─── Fichaje: pausas pasadas + turno vivo de hoy (trabajando / en pausa) ─────

async function seedTimeClockBreaks(prisma: PrismaClient, orgId: string): Promise<void> {
  const users = await prisma.user.findMany({
    where: { organizationId: orgId, role: { in: [UserRole.MANAGER, UserRole.CLERK] } },
  });

  const ensureEntry = async (
    userId: string,
    storeId: string,
    type: TimeClockType,
    at: Date,
    windowEnd: Date,
  ): Promise<void> => {
    const exists = await prisma.timeClockEntry.findFirst({
      where: {
        organizationId: orgId,
        userId,
        type,
        createdAt: { gte: at, lt: windowEnd },
      },
    });
    if (!exists) {
      await prisma.timeClockEntry.create({
        data: { organizationId: orgId, userId, storeId, type, createdAt: at },
      });
    }
  };

  // Días pasados: pausa de comida 14:00–14:30 en el turno ya cerrado.
  for (let daysAgo = 4; daysAgo >= 1; daysAgo--) {
    for (const user of users) {
      const clockIn = await prisma.timeClockEntry.findFirst({
        where: {
          organizationId: orgId,
          userId: user.id,
          type: TimeClockType.CLOCK_IN,
          createdAt: { gte: dateDaysAgo(daysAgo, 0, 0), lt: dateDaysAgo(daysAgo, 23, 59) },
        },
      });
      if (!clockIn) continue;
      await ensureEntry(
        user.id,
        clockIn.storeId,
        TimeClockType.BREAK_START,
        dateDaysAgo(daysAgo, 14, 0),
        dateDaysAgo(daysAgo, 15, 0),
      );
      await ensureEntry(
        user.id,
        clockIn.storeId,
        TimeClockType.BREAK_END,
        dateDaysAgo(daysAgo, 14, 30),
        dateDaysAgo(daysAgo, 15, 0),
      );
    }
  }

  // Hoy: la encargada hizo una pausa de café (cerrada) y el dependiente está
  // EN PAUSA ahora mismo (BREAK_START sin BREAK_END) → estados vivos en la UI.
  const todayShift = async (email: string): Promise<{ userId: string; storeId: string } | null> => {
    const user = await prisma.user.findFirst({ where: { organizationId: orgId, email } });
    if (!user) return null;
    const clockIn = await prisma.timeClockEntry.findFirst({
      where: {
        organizationId: orgId,
        userId: user.id,
        type: TimeClockType.CLOCK_IN,
        createdAt: { gte: dateDaysAgo(0, 0, 0) },
      },
    });
    if (!clockIn) return null;
    const clockOut = await prisma.timeClockEntry.findFirst({
      where: {
        organizationId: orgId,
        userId: user.id,
        type: TimeClockType.CLOCK_OUT,
        createdAt: { gte: dateDaysAgo(0, 0, 0) },
      },
    });
    return clockOut ? null : { userId: user.id, storeId: clockIn.storeId };
  };

  const managerShift = await todayShift('manager@demo.simpletpv');
  if (managerShift) {
    await ensureEntry(
      managerShift.userId,
      managerShift.storeId,
      TimeClockType.BREAK_START,
      dateDaysAgo(0, 11, 0),
      dateDaysAgo(0, 12, 0),
    );
    await ensureEntry(
      managerShift.userId,
      managerShift.storeId,
      TimeClockType.BREAK_END,
      dateDaysAgo(0, 11, 20),
      dateDaysAgo(0, 12, 0),
    );
  }

  const clerkShift = await todayShift('clerk@demo.simpletpv');
  if (clerkShift) {
    await ensureEntry(
      clerkShift.userId,
      clerkShift.storeId,
      TimeClockType.BREAK_START,
      dateDaysAgo(0, 14, 0),
      dateDaysAgo(0, 15, 0),
    );
  }
}

// ─── Reposición de inventario + alertas sincronizadas con el stock real ─────

// El histórico de ventas drena el stock en cada re-siembra; sin reposición la
// demo acaba con casi todo agotado. Esta regularización deja el inventario sano
// salvo un conjunto CURADO de productos bajos/agotados para la demo de alertas.
// storeCode '*' aplica a todas las tiendas. La Gorilla queda agotada en TODAS:
// el e2e del TPV (sale-search) asume al menos un producto agotado en la rejilla
// de la primera tienda del usuario, sea cual sea.
const CURATED_STOCK: Array<{ product: string; storeCode: string; qty: number }> = [
  { product: 'Flor CBD Gorilla 15%', storeCode: '*', qty: 0 },
  { product: 'Aceite CBD 20% — Beemine', storeCode: '01', qty: 3 },
  { product: 'Crema CBD muscular', storeCode: '01', qty: 2 },
  { product: 'Bolsa hermética', storeCode: '01', qty: 4 },
  { product: 'Flor CBD Amnesia 18%', storeCode: '02', qty: 6 },
  { product: 'Camiseta marca', storeCode: '02', qty: 0 },
];

async function seedRestock(prisma: PrismaClient, orgId: string): Promise<void> {
  const admin = await prisma.user.findFirst({
    where: { organizationId: orgId, role: UserRole.ADMIN },
  });
  // TODAS las tiendas, también las inactivas: el TPV usa la primera tienda del
  // usuario (hoy "Almacén Demo", inactiva) y un almacén vacío rompe la demo.
  const stocks = await prisma.stock.findMany({
    where: { organizationId: orgId },
    include: { product: { select: { name: true } }, store: { select: { code: true } } },
  });
  for (const s of stocks) {
    const qty = Number(s.quantity);
    const min = Number(s.minStock);
    const curated = CURATED_STOCK.find(
      (c) => c.product === s.product.name && (c.storeCode === '*' || c.storeCode === s.store.code),
    );
    let target: number | null = null;
    if (curated) {
      target = curated.qty;
    } else if (qty <= min) {
      // Reposición a un nivel sano, con variación determinista por producto.
      const jitter = parseInt(s.productId.slice(0, 8), 16) % 13;
      target = Math.max(min * 3, 18) + jitter;
    }
    if (target === null || target === qty) continue;

    await prisma.stock.update({ where: { id: s.id }, data: { quantity: target } });
    await prisma.stockMovement.create({
      data: {
        organizationId: orgId,
        productId: s.productId,
        storeId: s.storeId,
        userId: admin?.id ?? null,
        type: MovementType.ADJUSTMENT,
        quantity: round2(target - qty),
        reason: 'Regularización de inventario',
      },
    });
  }
}

/**
 * Sincroniza StockAlert con el stock real: crea las alertas que faltan y
 * RESUELVE las que ya no aplican (igual que hace el flujo de movimientos).
 * Las resueltas quedan como histórico en la vista de notificaciones.
 */
async function seedStockAlertsFromStock(prisma: PrismaClient, orgId: string): Promise<void> {
  // Mismo alcance que seedRestock (todas las tiendas): las alertas reflejan el
  // stock real de cada tienda con fila de stock, activa o no.
  const stocks = await prisma.stock.findMany({ where: { organizationId: orgId } });
  const expectedByKey = new Map<string, AlertType>();
  for (const s of stocks) {
    const qty = Number(s.quantity);
    const min = Number(s.minStock);
    if (qty <= 0) expectedByKey.set(`${s.productId}|${s.storeId}`, AlertType.OUT_OF_STOCK);
    else if (min > 0 && qty <= min)
      expectedByKey.set(`${s.productId}|${s.storeId}`, AlertType.LOW_STOCK);
  }

  // 1. Resolver alertas activas que ya no se corresponden con el stock.
  const actives = await prisma.stockAlert.findMany({
    where: { organizationId: orgId, resolved: false },
  });
  const stillActive = new Set<string>();
  for (const a of actives) {
    const key = `${a.productId}|${a.storeId}`;
    if (expectedByKey.get(key) === a.alertType) {
      stillActive.add(key);
      continue;
    }
    await prisma.stockAlert.update({
      where: { id: a.id },
      data: { resolved: true, resolvedAt: new Date() },
    });
  }

  // 2. Crear las alertas esperadas que aún no tienen alerta activa.
  for (const [key, alertType] of expectedByKey) {
    if (stillActive.has(key)) continue;
    const [productId, storeId] = key.split('|') as [string, string];
    await prisma.stockAlert.create({
      data: { organizationId: orgId, productId, storeId, alertType },
    });
  }
}

// ─── Pedidos de compra: recepción parcial y recepción completa ───────────────

async function seedPurchaseOrderStates(prisma: PrismaClient, orgId: string): Promise<void> {
  const admin = await prisma.user.findFirst({
    where: { organizationId: orgId, role: UserRole.ADMIN },
  });
  if (!admin) return;

  const specs = [
    {
      marker: 'Recepción parcial demo',
      supplierName: 'Importaciones García',
      storeCode: '01',
      status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
      createdDaysAgo: 7,
      confirmedDaysAgo: 6,
      receivedDaysAgo: null as number | null,
      receiptDaysAgo: 2,
      lines: [
        { product: 'Aceite CBD 5%', ordered: 10, received: 10 },
        { product: 'Cápsulas CBD 30u', ordered: 10, received: 4 },
        { product: 'Champú CBD', ordered: 6, received: 0 },
      ],
    },
    {
      marker: 'Pedido demo recibido completo',
      supplierName: 'Distribuciones Norte',
      storeCode: '02',
      status: PurchaseOrderStatus.RECEIVED,
      createdDaysAgo: 16,
      confirmedDaysAgo: 15,
      receivedDaysAgo: 8 as number | null,
      receiptDaysAgo: 8,
      lines: [
        { product: 'Sérum CBD', ordered: 8, received: 8 },
        { product: 'Bote cristal UV', ordered: 12, received: 12 },
      ],
    },
  ];

  for (const spec of specs) {
    const existing = await prisma.purchaseOrder.findFirst({
      where: { organizationId: orgId, notes: spec.marker },
    });
    if (existing) continue;

    const supplier = await prisma.supplier.findFirst({
      where: { organizationId: orgId, name: spec.supplierName },
    });
    const store = await storeByCode(prisma, orgId, spec.storeCode);
    if (!supplier || !store) continue;

    const lines: Array<{ productId: string; ordered: number; received: number; cost: number }> = [];
    for (const l of spec.lines) {
      const product = await productByName(prisma, orgId, l.product);
      if (!product) continue;
      lines.push({
        productId: product.id,
        ordered: l.ordered,
        received: l.received,
        cost: product.costPrice > 0 ? product.costPrice : round2(product.salePrice * 0.5),
      });
    }
    if (lines.length === 0) continue;

    const po = await prisma.purchaseOrder.create({
      data: {
        organizationId: orgId,
        supplierId: supplier.id,
        storeId: store.id,
        status: spec.status,
        notes: spec.marker,
        createdBy: admin.id,
        createdAt: dateDaysAgo(spec.createdDaysAgo, 9, 30),
        confirmedAt: dateDaysAgo(spec.confirmedDaysAgo, 12, 0),
        receivedAt: spec.receivedDaysAgo !== null ? dateDaysAgo(spec.receivedDaysAgo, 10, 0) : null,
        lines: {
          create: lines.map((l) => ({
            organizationId: orgId,
            productId: l.productId,
            quantityOrdered: l.ordered,
            quantityReceived: l.received,
            unitCost: l.cost,
          })),
        },
      },
    });

    // Entradas de stock por lo recibido, con su movimiento PURCHASE_RECEIPT.
    for (const l of lines) {
      if (l.received <= 0) continue;
      await applyStockDelta(prisma, l.productId, store.id, l.received);
      await prisma.stockMovement.create({
        data: {
          organizationId: orgId,
          productId: l.productId,
          storeId: store.id,
          userId: admin.id,
          type: MovementType.PURCHASE_RECEIPT,
          quantity: l.received,
          referenceId: po.id,
          createdAt: dateDaysAgo(spec.receiptDaysAgo, 10, 0),
        },
      });
    }
  }
}

// ─── B2B: tercer cliente y pedidos mayoristas en todos los estados ───────────

async function seedWholesaleStates(prisma: PrismaClient, orgId: string): Promise<void> {
  let growshop = await prisma.customer.findFirst({
    where: { organizationId: orgId, nif: 'B11223344' },
  });
  if (!growshop) {
    growshop = await prisma.customer.create({
      data: {
        organizationId: orgId,
        name: 'Growshop Garden Sevilla',
        nif: 'B11223344',
        email: 'pedidos@gardensevilla.es',
        phone: '+34 954 11 22 33',
        address: 'C/ Feria 12, 41003 Sevilla',
        priceListId: null, // sin tarifa: las líneas congelan el PVP
      },
    });
  }

  const herbolario = await prisma.customer.findFirst({
    where: { organizationId: orgId, nif: 'B12345678' },
  });
  const farmacia = await prisma.customer.findFirst({
    where: { organizationId: orgId, nif: 'B87654321' },
  });

  const products = await prisma.product.findMany({
    where: { organizationId: orgId },
    orderBy: { name: 'asc' },
    take: 6,
  });
  if (products.length < 4) return;

  const specs = [
    {
      marker: 'Borrador pedido mensual',
      customer: herbolario,
      status: WholesaleOrderStatus.DRAFT,
      daysAgo: 0,
      items: products
        .slice(0, 2)
        .map((p) => ({ id: p.id, price: Number(p.salePrice) * 0.7, qty: 6 })),
    },
    {
      marker: 'Pedido enviado semana pasada',
      customer: farmacia,
      status: WholesaleOrderStatus.SHIPPED,
      daysAgo: 6,
      items: products
        .slice(2, 5)
        .map((p) => ({ id: p.id, price: Number(p.salePrice) * 0.7, qty: 12 })),
    },
    {
      marker: 'Anulado por falta de stock',
      customer: growshop,
      status: WholesaleOrderStatus.CANCELLED,
      daysAgo: 10,
      items: products.slice(5, 6).map((p) => ({ id: p.id, price: Number(p.salePrice), qty: 20 })),
    },
  ];

  for (const spec of specs) {
    if (!spec.customer) continue;
    const existing = await prisma.wholesaleOrder.findFirst({
      where: { organizationId: orgId, notes: spec.marker },
    });
    if (existing) continue;

    const lines = spec.items.map((i) => ({
      organizationId: orgId,
      productId: i.id,
      qty: i.qty,
      unitPrice: round2(i.price),
      lineTotal: round2(i.price * i.qty),
    }));
    await prisma.wholesaleOrder.create({
      data: {
        organizationId: orgId,
        customerId: spec.customer.id,
        status: spec.status,
        notes: spec.marker,
        total: round2(lines.reduce((sum, l) => sum + l.lineTotal, 0)),
        createdAt: dateDaysAgo(spec.daysAgo, 12, 0),
        lines: { create: lines },
      },
    });
  }
}

// ─── VeriFactu: registros PENDING y FAILED (la cola con reintentos) ──────────

async function seedVerifactuStates(prisma: PrismaClient, orgId: string): Promise<void> {
  const pendingExists = await prisma.verifactuRecord.findFirst({
    where: {
      organizationId: orgId,
      status: { in: [VerifactuStatus.PENDING, VerifactuStatus.FAILED] },
    },
  });
  if (pendingExists) return;

  const covered = await prisma.verifactuRecord.findMany({
    where: { organizationId: orgId },
    select: { saleId: true },
  });
  const coveredIds = covered.map((r) => r.saleId).filter((id): id is string => id !== null);
  const sales = await prisma.sale.findMany({
    where: { organizationId: orgId, id: { notIn: coveredIds } },
    orderBy: { createdAt: 'desc' },
    take: 2,
  });
  if (sales.length < 2) return;

  const last = await prisma.verifactuRecord.findFirst({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
  });
  let previousHash = last?.hash ?? null;

  const specs = [
    { sale: sales[0]!, status: VerifactuStatus.PENDING, attempts: 0, lastError: null },
    {
      sale: sales[1]!,
      status: VerifactuStatus.FAILED,
      attempts: 3,
      lastError: 'AEAT: servicio no disponible (timeout tras 3 reintentos)',
    },
  ];
  for (const spec of specs) {
    const hash = createHash('sha256')
      .update(`${spec.sale.id}|${spec.sale.ticketNumber}`)
      .digest('hex')
      .slice(0, 16);
    await prisma.verifactuRecord.create({
      data: {
        organizationId: orgId,
        saleId: spec.sale.id,
        type: VerifactuType.INVOICE,
        status: spec.status,
        hash,
        previousHash,
        payload: { total: Number(spec.sale.total), ticketNumber: spec.sale.ticketNumber },
        attempts: spec.attempts,
        lastError: spec.lastError,
      },
    });
    previousHash = hash;
  }
}

// ─── Exports de ventas (COMPLETED con CSV, FAILED y PENDING) ─────────────────

async function seedSalesExports(prisma: PrismaClient, orgId: string): Promise<void> {
  const existing = await prisma.salesExport.count({ where: { organizationId: orgId } });
  if (existing > 0) return;

  const admin = await prisma.user.findFirst({
    where: { organizationId: orgId, role: UserRole.ADMIN },
  });
  const store01 = await storeByCode(prisma, orgId, '01');
  if (!admin) return;

  const from = dateDaysAgo(7, 0, 0);
  const recent = await prisma.sale.findMany({
    where: { organizationId: orgId, createdAt: { gte: from } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { store: { select: { code: true } } },
  });
  const header = 'ticket;fecha;tienda;metodo;total';
  const rows = recent.map(
    (s) =>
      `${s.ticketNumber};${s.createdAt.toISOString()};${s.store.code};${s.paymentMethod};${Number(s.total).toFixed(2)}`,
  );
  const csv = [header, ...rows].join('\n');

  await prisma.salesExport.create({
    data: {
      organizationId: orgId,
      status: SalesExportStatus.COMPLETED,
      filters: { from: from.toISOString(), to: new Date().toISOString() },
      rowCount: rows.length,
      csv,
      requestedById: admin.id,
      createdAt: dateDaysAgo(1, 9, 5),
      completedAt: dateDaysAgo(1, 9, 6),
    },
  });
  await prisma.salesExport.create({
    data: {
      organizationId: orgId,
      status: SalesExportStatus.FAILED,
      filters: { q: 'flor', from: dateDaysAgo(400, 0, 0).toISOString() },
      error: 'Tiempo de generación excedido — acota el rango de fechas',
      requestedById: admin.id,
      createdAt: dateDaysAgo(3, 16, 40),
      completedAt: dateDaysAgo(3, 16, 42),
    },
  });
  await prisma.salesExport.create({
    data: {
      organizationId: orgId,
      status: SalesExportStatus.PENDING,
      filters: store01 ? { storeId: store01.id } : {},
      requestedById: admin.id,
    },
  });
}

// ─── API keys (una activa con tarifa, otra revocada) ─────────────────────────

// Key demo CONOCIDA para poder probar la API pública en local/staging.
// Mismo formato que ApiKeysService: stpv_<prefix8>_<random>, sha256 en BD.
export const DEMO_API_KEY = 'stpv_demoseed_q7VxZk31fWp9rLtH2mYcAbD5uJnE8gKs0iO4PvRwTxQ';

async function seedApiKeys(prisma: PrismaClient, orgId: string): Promise<void> {
  const priceList = await prisma.priceList.findFirst({
    where: { organizationId: orgId, name: 'Tarifa Mayorista Demo' },
  });

  await prisma.apiKey.upsert({
    where: { hashedKey: createHash('sha256').update(DEMO_API_KEY).digest('hex') },
    update: { lastUsedAt: new Date(Date.now() - 60 * 60_000) },
    create: {
      organizationId: orgId,
      name: 'Integración web (demo)',
      prefix: 'demoseed',
      hashedKey: createHash('sha256').update(DEMO_API_KEY).digest('hex'),
      priceListId: priceList?.id ?? null,
      lastUsedAt: new Date(Date.now() - 60 * 60_000),
    },
  });

  const revokedRaw = 'stpv_oldmovil_Zx9YwV8uT7sR6qP5oN4mL3kJ2iH1gF0eDcBa';
  await prisma.apiKey.upsert({
    where: { hashedKey: createHash('sha256').update(revokedRaw).digest('hex') },
    update: {},
    create: {
      organizationId: orgId,
      name: 'App móvil antigua',
      prefix: 'oldmovil',
      hashedKey: createHash('sha256').update(revokedRaw).digest('hex'),
      priceListId: null,
      createdAt: dateDaysAgo(40, 10, 0),
      lastUsedAt: dateDaysAgo(6, 18, 30),
      revokedAt: dateDaysAgo(5, 9, 0),
    },
  });
}

// ─── Ventas especiales: anulada, con descuentos y con cambio de efectivo ─────

async function seedSpecialSales(prisma: PrismaClient, orgId: string): Promise<void> {
  const store01 = await storeByCode(prisma, orgId, '01');
  if (!store01) return;
  const markerTicket = `${store01.code}-${yyyymmdd(dateDaysAgo(1, 0, 0))}-901`;
  const existing = await prisma.sale.findUnique({
    where: { organizationId_ticketNumber: { organizationId: orgId, ticketNumber: markerTicket } },
  });
  if (existing) return;

  const admin = await prisma.user.findFirst({
    where: { organizationId: orgId, role: UserRole.ADMIN },
  });
  const manager = await prisma.user.findFirst({
    where: { organizationId: orgId, role: UserRole.MANAGER },
  });
  const clerk = await prisma.user.findFirst({
    where: { organizationId: orgId, role: UserRole.CLERK },
  });
  if (!admin || !manager || !clerk) return;

  const vapo = await productByName(prisma, orgId, 'Vaporizador portátil');
  const aceite5 = await productByName(prisma, orgId, 'Aceite CBD 5%');
  const papel = await productByName(prisma, orgId, 'Papel de liar x5');
  const lemon = await productByName(prisma, orgId, 'Flor CBD Lemon Haze 20%');
  const ogkush = await productByName(prisma, orgId, 'Flor CBD OG Kush 22%');
  if (!vapo || !aceite5 || !papel || !lemon || !ogkush) return;

  // S1 — anulada ayer (status VOIDED, voidedBy admin). Tarjeta: no toca caja.
  await prisma.sale.create({
    data: {
      organizationId: orgId,
      storeId: store01.id,
      userId: clerk.id,
      ticketNumber: markerTicket,
      subtotal: vapo.salePrice,
      total: vapo.salePrice,
      paymentMethod: PaymentMethod.CARD,
      status: SaleStatus.VOIDED,
      voidedAt: dateDaysAgo(1, 17, 50),
      voidedBy: admin.id,
      createdAt: dateDaysAgo(1, 17, 42),
      lines: {
        create: [
          {
            organizationId: orgId,
            productId: vapo.id,
            name: 'Vaporizador portátil',
            unitPrice: vapo.salePrice,
            qty: 1,
            taxRate: vapo.taxRate,
            costPrice: vapo.costPrice,
            lineTotal: vapo.salePrice,
          },
        ],
      },
    },
  });

  // S2 — hoy, efectivo con cambio y descuento voluntario del 10 % en una línea.
  const s2Gross1 = round2(aceite5.salePrice * 2);
  const s2Disc1 = round2((s2Gross1 * 10) / 100);
  const s2Net1 = round2(s2Gross1 - s2Disc1);
  const s2Subtotal = round2(s2Net1 + papel.salePrice);
  const s2CashGiven = 50;
  const s2 = await prisma.sale.create({
    data: {
      organizationId: orgId,
      storeId: store01.id,
      userId: clerk.id,
      ticketNumber: `${store01.code}-${yyyymmdd(new Date())}-901`,
      subtotal: s2Subtotal,
      discountTotal: s2Disc1,
      total: s2Subtotal,
      paymentMethod: PaymentMethod.CASH,
      cashGiven: s2CashGiven,
      cashChange: round2(s2CashGiven - s2Subtotal),
      createdAt: dateDaysAgo(0, 10, 22),
      lines: {
        create: [
          {
            organizationId: orgId,
            productId: aceite5.id,
            name: 'Aceite CBD 5%',
            unitPrice: aceite5.salePrice,
            qty: 2,
            discountPct: 10,
            discountAmt: s2Disc1,
            discountSource: DiscountSource.VOLUNTARY,
            taxRate: aceite5.taxRate,
            costPrice: aceite5.costPrice,
            lineTotal: s2Net1,
          },
          {
            organizationId: orgId,
            productId: papel.id,
            name: 'Papel de liar x5',
            unitPrice: papel.salePrice,
            qty: 1,
            taxRate: papel.taxRate,
            costPrice: papel.costPrice,
            lineTotal: papel.salePrice,
          },
        ],
      },
    },
  });

  // S3 — hoy, tarjeta, promoción "2 o más Flores: -15%" aplicada a ambas líneas.
  const s3Lines = [
    { p: lemon, name: 'Flor CBD Lemon Haze 20%', qty: 2 },
    { p: ogkush, name: 'Flor CBD OG Kush 22%', qty: 2 },
  ].map((l) => {
    const gross = round2(l.p.salePrice * l.qty);
    const disc = round2((gross * 15) / 100);
    return { ...l, gross, disc, net: round2(gross - disc) };
  });
  const s3Subtotal = round2(s3Lines.reduce((acc, l) => acc + l.net, 0));
  const s3DiscTotal = round2(s3Lines.reduce((acc, l) => acc + l.disc, 0));
  const s3 = await prisma.sale.create({
    data: {
      organizationId: orgId,
      storeId: store01.id,
      userId: manager.id,
      ticketNumber: `${store01.code}-${yyyymmdd(new Date())}-902`,
      subtotal: s3Subtotal,
      discountTotal: s3DiscTotal,
      total: s3Subtotal,
      paymentMethod: PaymentMethod.CARD,
      createdAt: dateDaysAgo(0, 13, 5),
      lines: {
        create: s3Lines.map((l) => ({
          organizationId: orgId,
          productId: l.p.id,
          name: l.name,
          unitPrice: l.p.salePrice,
          qty: l.qty,
          discountPct: 15,
          discountAmt: l.disc,
          discountSource: DiscountSource.PROMOTION,
          taxRate: l.p.taxRate,
          costPrice: l.p.costPrice,
          lineTotal: l.net,
        })),
      },
    },
  });

  // Stock y movimientos SALE de las ventas completadas (la anulada no descuenta).
  const saleEffects: Array<{ saleId: string; productId: string; qty: number; userId: string }> = [
    { saleId: s2.id, productId: aceite5.id, qty: 2, userId: clerk.id },
    { saleId: s2.id, productId: papel.id, qty: 1, userId: clerk.id },
    { saleId: s3.id, productId: lemon.id, qty: 2, userId: manager.id },
    { saleId: s3.id, productId: ogkush.id, qty: 2, userId: manager.id },
  ];
  for (const e of saleEffects) {
    await applyStockDelta(prisma, e.productId, store01.id, -e.qty);
    await prisma.stockMovement.create({
      data: {
        organizationId: orgId,
        productId: e.productId,
        storeId: store01.id,
        userId: e.userId,
        type: MovementType.SALE,
        quantity: -e.qty,
        referenceId: e.saleId,
      },
    });
  }
}

// ─── Auditoría (mismo formato que AuditInterceptor: action=verbo HTTP) ───────

async function seedAuditLogs(prisma: PrismaClient, orgId: string): Promise<void> {
  const existing = await prisma.auditLog.count({ where: { organizationId: orgId } });
  if (existing >= 10) return;

  const admin = await prisma.user.findFirst({
    where: { organizationId: orgId, role: UserRole.ADMIN },
  });
  const manager = await prisma.user.findFirst({
    where: { organizationId: orgId, role: UserRole.MANAGER },
  });
  const clerk = await prisma.user.findFirst({
    where: { organizationId: orgId, role: UserRole.CLERK },
  });
  if (!admin || !manager || !clerk) return;

  const firstProduct = await prisma.product.findFirst({ where: { organizationId: orgId } });
  const entries = [
    { action: 'POST', entity: 'sales', userId: clerk.id, daysAgo: 0, hour: 10 },
    { action: 'POST', entity: 'returns', userId: clerk.id, daysAgo: 0, hour: 11 },
    { action: 'POST', entity: 'cash-movements', userId: manager.id, daysAgo: 0, hour: 12 },
    {
      action: 'PATCH',
      entity: 'products',
      userId: admin.id,
      daysAgo: 1,
      hour: 9,
      entityId: firstProduct?.id,
    },
    { action: 'POST', entity: 'products', userId: admin.id, daysAgo: 1, hour: 9 },
    { action: 'POST', entity: 'cash-sessions', userId: manager.id, daysAgo: 1, hour: 21 },
    { action: 'POST', entity: 'transfers', userId: manager.id, daysAgo: 2, hour: 10 },
    { action: 'PATCH', entity: 'stores', userId: admin.id, daysAgo: 3, hour: 17 },
    { action: 'PATCH', entity: 'promotions', userId: admin.id, daysAgo: 4, hour: 16 },
    { action: 'DELETE', entity: 'api-keys', userId: admin.id, daysAgo: 5, hour: 9 },
    { action: 'POST', entity: 'purchase-orders', userId: manager.id, daysAgo: 6, hour: 11 },
    { action: 'POST', entity: 'users', userId: admin.id, daysAgo: 8, hour: 10 },
  ];
  for (const e of entries) {
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        userId: e.userId,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        createdAt: dateDaysAgo(e.daysAgo, e.hour, 15),
      },
    });
  }
}

// ─── Backfill: coste congelado en líneas históricas (margen real en stats) ───

async function backfillSaleLineCosts(prisma: PrismaClient, orgId: string): Promise<void> {
  const products = await prisma.product.findMany({
    where: { organizationId: orgId, costPrice: { gt: 0 } },
    select: { id: true, costPrice: true },
  });
  for (const p of products) {
    await prisma.saleLine.updateMany({
      where: { organizationId: orgId, productId: p.id, costPrice: 0 },
      data: { costPrice: p.costPrice },
    });
  }
}

/**
 * Da variedad de COBRO al ledger de Ventas: convierte un puñado de ventas recientes
 * en facturas a crédito B2B (unas pendientes, otras vencidas) y un par en ventas de
 * canal Online, para que el ledger muestre el split Cobrado/Pendiente/Vencido y los
 * canales TPV/Online/B2B (las anuladas las aporta seedSpecialSales). Los vencimientos
 * son relativos a HOY (una factura vencida lo sigue estando al re-sembrar). Idempotente:
 * no toca nada si ya hay ventas con canal distinto de TPV.
 */
async function seedCobroLedger(prisma: PrismaClient, orgId: string): Promise<void> {
  const already = await prisma.sale.count({
    where: { organizationId: orgId, channel: { not: SaleChannel.TPV } },
  });
  if (already > 0) return;

  // Facturas B2B: razón social (nombre de cliente del ledger) + método + vencimiento
  // relativo a hoy (negativo = vencida; positivo = pendiente).
  const b2b = [
    { name: 'Obrador San Blas', method: PaymentMethod.TRANSFER, dueInDays: -3 },
    { name: 'Cafetería Lluvia', method: PaymentMethod.DIRECT_DEBIT, dueInDays: -9 },
    { name: 'Bar Quintana', method: PaymentMethod.TRANSFER, dueInDays: 12 },
    { name: 'Restaurante El Faro', method: PaymentMethod.TRANSFER, dueInDays: 20 },
    { name: 'Hotel Mar Azul', method: PaymentMethod.TRANSFER, dueInDays: 18 },
  ];

  // Ventas COMPLETED más recientes (excluye la anulada de seedSpecialSales).
  const recent = await prisma.sale.findMany({
    where: { organizationId: orgId, status: SaleStatus.COMPLETED },
    orderBy: { createdAt: 'desc' },
    take: b2b.length + 2,
    select: { id: true },
  });
  if (recent.length < b2b.length + 2) return;

  for (let i = 0; i < b2b.length; i += 1) {
    const due = new Date();
    due.setHours(0, 0, 0, 0);
    due.setDate(due.getDate() + b2b[i]!.dueInDays);
    await prisma.sale.update({
      where: { id: recent[i]!.id },
      data: {
        channel: SaleChannel.B2B,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: b2b[i]!.method,
        dueDate: due,
        paidAt: null,
        customerName: b2b[i]!.name,
        customerTaxId: `B${(63000000 + i).toString()}`,
      },
    });
  }

  // Dos ventas de canal Online (cobradas en el acto: se quedan PAID).
  for (let i = 0; i < 2; i += 1) {
    await prisma.sale.update({
      where: { id: recent[b2b.length + i]!.id },
      data: { channel: SaleChannel.ONLINE },
    });
  }
}

/** Punto de entrada: ejecuta todos los extras en orden de dependencia. */
export async function seedExtras(prisma: PrismaClient, orgId: string): Promise<void> {
  await seedProductDetails(prisma, orgId);
  await seedUserPins(prisma, orgId);
  await seedStoreOps(prisma, orgId);
  await seedDevices(prisma, orgId);
  await seedTransfers(prisma, orgId);
  await seedReturns(prisma, orgId);
  await seedCashMovements(prisma, orgId);
  await seedTimeClockBreaks(prisma, orgId);
  await seedSpecialSales(prisma, orgId);
  await seedCobroLedger(prisma, orgId);
  await seedPurchaseOrderStates(prisma, orgId);
  await seedWholesaleStates(prisma, orgId);
  await seedVerifactuStates(prisma, orgId);
  await seedSalesExports(prisma, orgId);
  await seedApiKeys(prisma, orgId);
  await seedAuditLogs(prisma, orgId);
  await backfillSaleLineCosts(prisma, orgId);
  // Al final: reposición sobre el stock YA ajustado por todo lo anterior, y
  // después las alertas se sincronizan con ese stock final.
  await seedRestock(prisma, orgId);
  await seedStockAlertsFromStock(prisma, orgId);
}
