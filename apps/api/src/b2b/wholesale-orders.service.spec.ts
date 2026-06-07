import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { WholesaleOrdersService } from './wholesale-orders.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

/** Ejecuta fn dentro del contexto de tenant. */
const run = <T>(fn: () => Promise<T>): Promise<T> => tenantStorage.run({ organizationId: ORG }, fn);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de mocks
// ─────────────────────────────────────────────────────────────────────────────

function makePrisma(
  opts: {
    customer?: unknown;
    products?: unknown[];
    priceListItems?: unknown[];
    createdOrder?: unknown;
    foundOrder?: unknown;
    updatedOrder?: unknown;
  } = {},
) {
  return {
    customer: {
      findFirst: vi.fn(async (..._a: unknown[]) => opts.customer ?? null),
    },
    product: {
      findMany: vi.fn(async (..._a: unknown[]) => opts.products ?? []),
    },
    priceListItem: {
      findMany: vi.fn(async (..._a: unknown[]) => opts.priceListItems ?? []),
    },
    wholesaleOrder: {
      create: vi.fn(async (args: unknown) => opts.createdOrder ?? args),
      findMany: vi.fn(async (..._a: unknown[]) => []),
      count: vi.fn(async (..._a: unknown[]) => 0),
      findFirst: vi.fn(async (..._a: unknown[]) => opts.foundOrder ?? null),
      updateMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
    },
  };
}

/** Cliente de ejemplo sin tarifa asignada. */
const baseCustomer = { id: 'cust-1', priceListId: null };

/** Producto de ejemplo activo. */
const baseProduct = { id: 'prod-1', salePrice: '10.00' };

/** DTO mínimo de creación. */
const baseCreateDto = {
  customerId: 'cust-1',
  lines: [{ productId: 'prod-1', qty: 3 }],
};

// ─────────────────────────────────────────────────────────────────────────────
// WholesaleOrdersService.create
// ─────────────────────────────────────────────────────────────────────────────

describe('WholesaleOrdersService.create', () => {
  it('lanza 400 si el cliente no existe o no pertenece al tenant (requireOwned)', async () => {
    const prisma = makePrisma({ customer: null });
    const service = new WholesaleOrdersService(prisma as never);

    await expect(run(() => service.create(baseCreateDto))).rejects.toThrow(BadRequestException);
  });

  it('lanza 400 si un producto no existe o está inactivo', async () => {
    // El cliente existe pero el producto no aparece en la consulta (active=true).
    const prisma = makePrisma({ customer: baseCustomer, products: [] });
    const service = new WholesaleOrdersService(prisma as never);

    await expect(run(() => service.create(baseCreateDto))).rejects.toThrow(
      /Producto no encontrado o inactivo/,
    );
  });

  it('usa PVP del producto cuando el cliente no tiene tarifa asignada', async () => {
    const createdOrder = {
      id: 'ord-1',
      total: 30,
      lines: [{ productId: 'prod-1', qty: 3, unitPrice: 10, lineTotal: 30 }],
      customer: { name: 'Empresa A' },
    };
    const prisma = makePrisma({
      customer: baseCustomer,
      products: [baseProduct],
      createdOrder,
    });
    const service = new WholesaleOrdersService(prisma as never);

    const result = await run(() => service.create(baseCreateDto));

    // Verifica que se llamó al create con el precio del producto (PVP).
    const createArg = prisma.wholesaleOrder.create.mock.calls[0]![0] as {
      data: { total: number; lines: { create: Array<{ unitPrice: number; lineTotal: number }> } };
    };
    expect(createArg.data.lines.create[0]!.unitPrice).toBeCloseTo(10, 2);
    expect(createArg.data.lines.create[0]!.lineTotal).toBeCloseTo(30, 2);
    expect(createArg.data.total).toBeCloseTo(30, 2);
    expect(result).toBe(createdOrder);
  });

  it('usa precio de la tarifa del cliente cuando está asignada', async () => {
    const customerWithTariff = { id: 'cust-2', priceListId: 'pl-1' };
    // Precio de tarifa: 8 (menor que el PVP 10).
    const priceListItems = [{ productId: 'prod-1', price: '8.00' }];
    const createdOrder = {
      id: 'ord-2',
      total: 24,
      lines: [{ productId: 'prod-1', qty: 3, unitPrice: 8, lineTotal: 24 }],
      customer: { name: 'Empresa B' },
    };
    const prisma = makePrisma({
      customer: customerWithTariff,
      products: [baseProduct],
      priceListItems,
      createdOrder,
    });
    const service = new WholesaleOrdersService(prisma as never);

    await run(() =>
      service.create({ customerId: 'cust-2', lines: [{ productId: 'prod-1', qty: 3 }] }),
    );

    const createArg = prisma.wholesaleOrder.create.mock.calls[0]![0] as {
      data: { total: number; lines: { create: Array<{ unitPrice: number; lineTotal: number }> } };
    };
    // Precio debe ser 8 (de la tarifa), no 10 (PVP).
    expect(createArg.data.lines.create[0]!.unitPrice).toBeCloseTo(8, 2);
    expect(createArg.data.lines.create[0]!.lineTotal).toBeCloseTo(24, 2);
    expect(createArg.data.total).toBeCloseTo(24, 2);
  });

  it('para producto sin tarifa usa el PVP como fallback aunque otros productos tengan tarifa', async () => {
    const customerWithTariff = { id: 'cust-3', priceListId: 'pl-1' };
    // Tarifa solo cubre prod-2, no prod-1.
    const products = [
      { id: 'prod-1', salePrice: '10.00' },
      { id: 'prod-2', salePrice: '20.00' },
    ];
    const priceListItems = [{ productId: 'prod-2', price: '15.00' }];
    const prisma = makePrisma({
      customer: customerWithTariff,
      products,
      priceListItems,
      createdOrder: {
        id: 'ord-3',
        total: 25, // 10 + 15
        lines: [],
        customer: { name: 'X' },
      },
    });
    const service = new WholesaleOrdersService(prisma as never);

    await run(() =>
      service.create({
        customerId: 'cust-3',
        lines: [
          { productId: 'prod-1', qty: 1 },
          { productId: 'prod-2', qty: 1 },
        ],
      }),
    );

    const createArg = prisma.wholesaleOrder.create.mock.calls[0]![0] as {
      data: { lines: { create: Array<{ productId: string; unitPrice: number }> } };
    };
    const line1 = createArg.data.lines.create.find((l) => l.productId === 'prod-1')!;
    const line2 = createArg.data.lines.create.find((l) => l.productId === 'prod-2')!;
    expect(line1.unitPrice).toBeCloseTo(10, 2); // PVP (sin tarifa)
    expect(line2.unitPrice).toBeCloseTo(15, 2); // Precio de tarifa
  });

  it('el total está redondeado a 2 decimales', async () => {
    // PVP 10/3 = 3.3333...; qty 1 → lineTotal 3.33; total 3.33.
    const product = { id: 'prod-x', salePrice: String(10 / 3) };
    const prisma = makePrisma({
      customer: baseCustomer,
      products: [product],
      createdOrder: { id: 'ord-r', total: 3.33, lines: [], customer: { name: 'X' } },
    });
    const service = new WholesaleOrdersService(prisma as never);

    await run(() =>
      service.create({ customerId: 'cust-1', lines: [{ productId: 'prod-x', qty: 1 }] }),
    );

    const createArg = prisma.wholesaleOrder.create.mock.calls[0]![0] as {
      data: { total: number };
    };
    // round2 → 2 decimales máximo.
    const totalStr = createArg.data.total.toString();
    const decimals = totalStr.includes('.') ? totalStr.split('.')[1]!.length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const prisma = makePrisma();
    const service = new WholesaleOrdersService(prisma as never);

    await expect(service.create(baseCreateDto)).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WholesaleOrdersService.list
// ─────────────────────────────────────────────────────────────────────────────

describe('WholesaleOrdersService.list', () => {
  function makeListPrisma(items: unknown[] = [], total = 0) {
    return {
      customer: { findFirst: vi.fn(async (..._a: unknown[]) => null) },
      product: { findMany: vi.fn(async (..._a: unknown[]) => []) },
      priceListItem: { findMany: vi.fn(async (..._a: unknown[]) => []) },
      wholesaleOrder: {
        create: vi.fn(async (..._a: unknown[]) => ({})),
        findMany: vi.fn(async (..._a: unknown[]) => items),
        count: vi.fn(async (..._a: unknown[]) => total),
        findFirst: vi.fn(async (..._a: unknown[]) => null),
        updateMany: vi.fn(async (..._a: unknown[]) => ({ count: 0 })),
      },
    };
  }

  it('devuelve lista paginada con mapeo correcto', async () => {
    const orderRow = {
      id: 'ord-1',
      customerId: 'cust-1',
      status: 'DRAFT',
      total: 100,
      createdAt: new Date('2026-01-01'),
      customer: { name: 'Empresa A' },
      _count: { lines: 3 },
    };
    const prisma = makeListPrisma([orderRow], 1);
    const service = new WholesaleOrdersService(prisma as never);

    const result = await run(() => service.list({}));

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'ord-1',
      customerId: 'cust-1',
      customerName: 'Empresa A',
      status: 'DRAFT',
      total: 100,
      lineCount: 3,
    });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.totalItems).toBe(1);
  });

  it('filtra por status cuando es válido', async () => {
    const prisma = makeListPrisma();
    const service = new WholesaleOrdersService(prisma as never);

    await run(() => service.list({ status: 'CONFIRMED' }));

    const findManyArg = prisma.wholesaleOrder.findMany.mock.calls[0]![0] as {
      where: { status?: string };
    };
    expect(findManyArg.where.status).toBe('CONFIRMED');
  });

  it('ignora status inválido (no lo incluye en el where)', async () => {
    const prisma = makeListPrisma();
    const service = new WholesaleOrdersService(prisma as never);

    await run(() => service.list({ status: 'INVALIDO' }));

    const findManyArg = prisma.wholesaleOrder.findMany.mock.calls[0]![0] as {
      where: { status?: string };
    };
    expect(findManyArg.where.status).toBeUndefined();
  });

  it('filtra por customerId cuando se proporciona', async () => {
    const prisma = makeListPrisma();
    const service = new WholesaleOrdersService(prisma as never);

    await run(() => service.list({ customerId: 'cust-99' }));

    const findManyArg = prisma.wholesaleOrder.findMany.mock.calls[0]![0] as {
      where: { customerId?: string };
    };
    expect(findManyArg.where.customerId).toBe('cust-99');
  });

  it('usa page=1 si no se proporciona o es ≤0', async () => {
    const prisma = makeListPrisma();
    const service = new WholesaleOrdersService(prisma as never);

    await run(() => service.list({ page: 0 }));

    const result = await run(() => service.list({}));
    expect(result.page).toBe(1);
  });

  it('usa la página indicada para calcular el skip', async () => {
    const prisma = makeListPrisma();
    const service = new WholesaleOrdersService(prisma as never);

    await run(() => service.list({ page: 3 }));

    const findManyArg = prisma.wholesaleOrder.findMany.mock.calls[0]![0] as {
      skip: number;
    };
    expect(findManyArg.skip).toBe(40); // (3-1) * 20
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = new WholesaleOrdersService(makeListPrisma() as never);
    await expect(service.list({})).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WholesaleOrdersService.get
// ─────────────────────────────────────────────────────────────────────────────

describe('WholesaleOrdersService.get', () => {
  it('llama a findFirst con id y organizationId del tenant', async () => {
    const order = { id: 'ord-1', status: 'DRAFT', customer: {}, lines: [] };
    const prisma = makePrisma({ foundOrder: order });
    const service = new WholesaleOrdersService(prisma as never);

    const result = await run(() => service.get('ord-1'));

    const findArg = prisma.wholesaleOrder.findFirst.mock.calls[0]![0] as {
      where: { id: string; organizationId: string };
    };
    expect(findArg.where.id).toBe('ord-1');
    expect(findArg.where.organizationId).toBe(ORG);
    expect(result).toBe(order);
  });

  it('devuelve null si el pedido no existe en el tenant', async () => {
    const prisma = makePrisma({ foundOrder: null });
    const service = new WholesaleOrdersService(prisma as never);

    const result = await run(() => service.get('nope'));
    expect(result).toBeNull();
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = new WholesaleOrdersService(makePrisma() as never);
    await expect(service.get('ord-1')).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WholesaleOrdersService.updateStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('WholesaleOrdersService.updateStatus', () => {
  function makeUpdatePrisma(opts: { foundOrder?: unknown; updatedOrder?: unknown }) {
    return {
      customer: { findFirst: vi.fn(async (..._a: unknown[]) => null) },
      product: { findMany: vi.fn(async (..._a: unknown[]) => []) },
      priceListItem: { findMany: vi.fn(async (..._a: unknown[]) => []) },
      wholesaleOrder: {
        create: vi.fn(async (..._a: unknown[]) => ({})),
        findMany: vi.fn(async (..._a: unknown[]) => []),
        count: vi.fn(async (..._a: unknown[]) => 0),
        // Primer findFirst → el pedido a actualizar; segundo → resultado final.
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(opts.foundOrder ?? null)
          .mockResolvedValueOnce(opts.updatedOrder ?? null),
        updateMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
      },
    };
  }

  it('lanza 400 si el estado no es válido', async () => {
    const prisma = makeUpdatePrisma({ foundOrder: { status: 'DRAFT' } });
    const service = new WholesaleOrdersService(prisma as never);

    await expect(run(() => service.updateStatus('ord-1', 'PENDIENTE'))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lanza 404 si el pedido no existe en el tenant (requireFound)', async () => {
    const prisma = makeUpdatePrisma({ foundOrder: null });
    const service = new WholesaleOrdersService(prisma as never);

    await expect(run(() => service.updateStatus('nope', 'CONFIRMED'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza 400 si el pedido ya está SHIPPED (cerrado)', async () => {
    const prisma = makeUpdatePrisma({ foundOrder: { status: 'SHIPPED' } });
    const service = new WholesaleOrdersService(prisma as never);

    // Un solo expect: comprueba clase y mensaje en la misma llamada.
    await expect(run(() => service.updateStatus('ord-1', 'CONFIRMED'))).rejects.toThrow(/cerrado/);
  });

  it('lanza 400 si el pedido ya está CANCELLED (cerrado)', async () => {
    const prisma = makeUpdatePrisma({ foundOrder: { status: 'CANCELLED' } });
    const service = new WholesaleOrdersService(prisma as never);

    await expect(run(() => service.updateStatus('ord-1', 'DRAFT'))).rejects.toThrow(/cerrado/);
  });

  it('transición válida: llama a updateMany y devuelve el pedido actualizado', async () => {
    const updatedOrder = { id: 'ord-1', status: 'CONFIRMED' };
    const prisma = makeUpdatePrisma({ foundOrder: { status: 'DRAFT' }, updatedOrder });
    const service = new WholesaleOrdersService(prisma as never);

    const result = await run(() => service.updateStatus('ord-1', 'CONFIRMED'));

    expect(prisma.wholesaleOrder.updateMany).toHaveBeenCalledOnce();
    const updateArg = prisma.wholesaleOrder.updateMany.mock.calls[0]![0] as {
      where: { id: string; organizationId: string };
      data: { status: string };
    };
    expect(updateArg.where.id).toBe('ord-1');
    expect(updateArg.where.organizationId).toBe(ORG);
    expect(updateArg.data.status).toBe('CONFIRMED');
    expect(result).toBe(updatedOrder);
  });

  it('permite cancelar desde DRAFT', async () => {
    const updatedOrder = { id: 'ord-2', status: 'CANCELLED' };
    const prisma = makeUpdatePrisma({ foundOrder: { status: 'DRAFT' }, updatedOrder });
    const service = new WholesaleOrdersService(prisma as never);

    const result = await run(() => service.updateStatus('ord-2', 'CANCELLED'));
    expect(result).toBe(updatedOrder);
  });

  it('permite cancelar desde CONFIRMED', async () => {
    const updatedOrder = { id: 'ord-3', status: 'CANCELLED' };
    const prisma = makeUpdatePrisma({ foundOrder: { status: 'CONFIRMED' }, updatedOrder });
    const service = new WholesaleOrdersService(prisma as never);

    const result = await run(() => service.updateStatus('ord-3', 'CANCELLED'));
    expect(result).toBe(updatedOrder);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const prisma = makeUpdatePrisma({ foundOrder: { status: 'DRAFT' } });
    const service = new WholesaleOrdersService(prisma as never);

    await expect(service.updateStatus('ord-1', 'CONFIRMED')).rejects.toThrow();
  });
});
