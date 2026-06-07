import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { CustomersService } from './customers.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

/** Ejecuta fn dentro del contexto de tenant. */
const run = <T>(fn: () => Promise<T>): Promise<T> => tenantStorage.run({ organizationId: ORG }, fn);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de mocks
// ─────────────────────────────────────────────────────────────────────────────

function makePrisma(
  opts: {
    customers?: unknown[];
    createdCustomer?: unknown;
    priceList?: unknown;
    updatedCustomer?: unknown;
  } = {},
) {
  return {
    customer: {
      findMany: vi.fn(async (..._a: unknown[]) => opts.customers ?? []),
      create: vi.fn(async (args: unknown) => opts.createdCustomer ?? args),
      updateMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
      findFirst: vi.fn(async (..._a: unknown[]) => opts.updatedCustomer ?? null),
      deleteMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
    },
    priceList: {
      findFirst: vi.fn(async (..._a: unknown[]) => opts.priceList ?? null),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CustomersService.list
// ─────────────────────────────────────────────────────────────────────────────

describe('CustomersService.list', () => {
  it('devuelve los clientes del tenant con su tarifa incluida', async () => {
    const customers = [
      { id: 'c1', name: 'Empresa A', organizationId: ORG, priceList: { id: 'pl-1', name: 'VIP' } },
      { id: 'c2', name: 'Empresa B', organizationId: ORG, priceList: null },
    ];
    const prisma = makePrisma({ customers });
    const service = new CustomersService(prisma as never);

    const result = await run(() => service.list());

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(customers[0]);
    expect(result[1]).toBe(customers[1]);
  });

  it('filtra por organizationId del tenant', async () => {
    const prisma = makePrisma({ customers: [] });
    const service = new CustomersService(prisma as never);

    await run(() => service.list());

    const findArg = prisma.customer.findMany.mock.calls[0]![0] as {
      where: { organizationId: string };
    };
    expect(findArg.where.organizationId).toBe(ORG);
  });

  it('devuelve array vacío cuando no hay clientes', async () => {
    const prisma = makePrisma({ customers: [] });
    const service = new CustomersService(prisma as never);

    const result = await run(() => service.list());
    expect(result).toEqual([]);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = new CustomersService(makePrisma() as never);
    await expect(service.list()).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CustomersService.create
// ─────────────────────────────────────────────────────────────────────────────

describe('CustomersService.create', () => {
  it('crea un cliente sin tarifa asignada', async () => {
    const created = { id: 'c-new', name: 'Empresa X', organizationId: ORG };
    const prisma = makePrisma({ createdCustomer: created });
    const service = new CustomersService(prisma as never);

    const result = await run(() => service.create({ name: 'Empresa X' }));

    const createArg = prisma.customer.create.mock.calls[0]![0] as {
      data: { organizationId: string; name: string; priceListId: unknown };
    };
    expect(createArg.data.organizationId).toBe(ORG);
    expect(createArg.data.name).toBe('Empresa X');
    expect(createArg.data.priceListId).toBeNull();
    // No llama a priceList.findFirst si no hay priceListId.
    expect(prisma.priceList.findFirst).not.toHaveBeenCalled();
    expect(result).toBe(created);
  });

  it('crea un cliente con tarifa asignada cuando la tarifa existe en el tenant', async () => {
    const plRow = { id: 'pl-1' };
    const created = { id: 'c-new', name: 'Empresa Y', priceListId: 'pl-1', organizationId: ORG };
    const prisma = makePrisma({ priceList: plRow, createdCustomer: created });
    const service = new CustomersService(prisma as never);

    const result = await run(() => service.create({ name: 'Empresa Y', priceListId: 'pl-1' }));

    // Debe validar que la tarifa pertenece al tenant.
    expect(prisma.priceList.findFirst).toHaveBeenCalledOnce();
    const findArg = prisma.priceList.findFirst.mock.calls[0]![0] as {
      where: { id: string; organizationId: string };
    };
    expect(findArg.where.id).toBe('pl-1');
    expect(findArg.where.organizationId).toBe(ORG);

    const createArg = prisma.customer.create.mock.calls[0]![0] as {
      data: { priceListId: string };
    };
    expect(createArg.data.priceListId).toBe('pl-1');
    expect(result).toBe(created);
  });

  it('lanza 400 si la tarifa asignada no existe en el tenant (assertPriceListInOrg)', async () => {
    // priceList: null → requireOwned lanza BadRequestException.
    const prisma = makePrisma({ priceList: null });
    const service = new CustomersService(prisma as never);

    await expect(
      run(() => service.create({ name: 'Empresa Z', priceListId: 'pl-inexistente' })),
    ).rejects.toThrow(BadRequestException);

    // No debe llamar a customer.create si la tarifa no es válida.
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('crea el cliente con campos opcionales nulos cuando no se proporcionan', async () => {
    const prisma = makePrisma({ createdCustomer: { id: 'c-n', name: 'N' } });
    const service = new CustomersService(prisma as never);

    await run(() => service.create({ name: 'N' }));

    const createArg = prisma.customer.create.mock.calls[0]![0] as {
      data: { nif: unknown; email: unknown; phone: unknown; address: unknown };
    };
    expect(createArg.data.nif).toBeNull();
    expect(createArg.data.email).toBeNull();
    expect(createArg.data.phone).toBeNull();
    expect(createArg.data.address).toBeNull();
  });

  it('crea el cliente con todos los campos opcionales cuando se proporcionan', async () => {
    const prisma = makePrisma({ createdCustomer: { id: 'c-full' } });
    const service = new CustomersService(prisma as never);

    await run(() =>
      service.create({
        name: 'Full',
        nif: 'B12345678',
        email: 'full@ejemplo.es',
        phone: '600000000',
        address: 'Calle Mayor 1',
      }),
    );

    const createArg = prisma.customer.create.mock.calls[0]![0] as {
      data: { nif: string; email: string; phone: string; address: string };
    };
    expect(createArg.data.nif).toBe('B12345678');
    expect(createArg.data.email).toBe('full@ejemplo.es');
    expect(createArg.data.phone).toBe('600000000');
    expect(createArg.data.address).toBe('Calle Mayor 1');
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = new CustomersService(makePrisma() as never);
    await expect(service.create({ name: 'X' })).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CustomersService.update
// ─────────────────────────────────────────────────────────────────────────────

describe('CustomersService.update', () => {
  function makeUpdatePrisma(opts: { priceList?: unknown; updatedCustomer?: unknown } = {}) {
    return {
      customer: {
        findMany: vi.fn(async (..._a: unknown[]) => []),
        create: vi.fn(async (..._a: unknown[]) => ({})),
        updateMany: vi.fn(async (..._a: unknown[]) => ({ count: 1 })),
        findFirst: vi.fn(async (..._a: unknown[]) => opts.updatedCustomer ?? null),
        deleteMany: vi.fn(async (..._a: unknown[]) => ({ count: 0 })),
      },
      priceList: {
        findFirst: vi.fn(async (..._a: unknown[]) => opts.priceList ?? null),
      },
    };
  }

  it('actualiza el nombre cuando se proporciona', async () => {
    const updated = { id: 'c-1', name: 'Nuevo nombre' };
    const prisma = makeUpdatePrisma({ updatedCustomer: updated });
    const service = new CustomersService(prisma as never);

    const result = await run(() => service.update('c-1', { name: 'Nuevo nombre' }));

    const updateArg = prisma.customer.updateMany.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data.name).toBe('Nuevo nombre');
    expect(result).toBe(updated);
  });

  it('actualiza el nif cuando se proporciona', async () => {
    const prisma = makeUpdatePrisma({ updatedCustomer: { id: 'c-1' } });
    const service = new CustomersService(prisma as never);

    await run(() => service.update('c-1', { nif: 'B99999999' }));

    const updateArg = prisma.customer.updateMany.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data.nif).toBe('B99999999');
  });

  it('actualiza email, phone y address cuando se proporcionan', async () => {
    const prisma = makeUpdatePrisma({ updatedCustomer: { id: 'c-1' } });
    const service = new CustomersService(prisma as never);

    await run(() =>
      service.update('c-1', {
        email: 'new@ejemplo.es',
        phone: '611111111',
        address: 'Calle Nueva 2',
      }),
    );

    const updateArg = prisma.customer.updateMany.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data.email).toBe('new@ejemplo.es');
    expect(updateArg.data.phone).toBe('611111111');
    expect(updateArg.data.address).toBe('Calle Nueva 2');
  });

  it('actualiza active cuando se proporciona', async () => {
    const prisma = makeUpdatePrisma({ updatedCustomer: { id: 'c-1', active: false } });
    const service = new CustomersService(prisma as never);

    await run(() => service.update('c-1', { active: false }));

    const updateArg = prisma.customer.updateMany.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data.active).toBe(false);
  });

  it('actualiza priceListId cuando la tarifa existe en el tenant', async () => {
    const prisma = makeUpdatePrisma({
      priceList: { id: 'pl-1' },
      updatedCustomer: { id: 'c-1', priceListId: 'pl-1' },
    });
    const service = new CustomersService(prisma as never);

    await run(() => service.update('c-1', { priceListId: 'pl-1' }));

    expect(prisma.priceList.findFirst).toHaveBeenCalledOnce();
    const updateArg = prisma.customer.updateMany.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(updateArg.data.priceListId).toBe('pl-1');
  });

  it('lanza 400 si la priceListId en update no existe en el tenant', async () => {
    // priceList: null → assertPriceListInOrg lanza 400.
    const prisma = makeUpdatePrisma({ priceList: null });
    const service = new CustomersService(prisma as never);

    await expect(run(() => service.update('c-1', { priceListId: 'pl-invalida' }))).rejects.toThrow(
      BadRequestException,
    );

    expect(prisma.customer.updateMany).not.toHaveBeenCalled();
  });

  it('no incluye campos no proporcionados en data', async () => {
    const prisma = makeUpdatePrisma({ updatedCustomer: { id: 'c-1' } });
    const service = new CustomersService(prisma as never);

    await run(() => service.update('c-1', {}));

    const updateArg = prisma.customer.updateMany.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(updateArg.data)).toHaveLength(0);
  });

  it('filtra por id y organizationId del tenant en updateMany', async () => {
    const prisma = makeUpdatePrisma({ updatedCustomer: { id: 'c-1' } });
    const service = new CustomersService(prisma as never);

    await run(() => service.update('c-1', { name: 'X' }));

    const updateArg = prisma.customer.updateMany.mock.calls[0]![0] as {
      where: { id: string; organizationId: string };
    };
    expect(updateArg.where.id).toBe('c-1');
    expect(updateArg.where.organizationId).toBe(ORG);
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = new CustomersService(makeUpdatePrisma() as never);
    await expect(service.update('c-1', { name: 'X' })).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CustomersService.remove
// ─────────────────────────────────────────────────────────────────────────────

describe('CustomersService.remove', () => {
  it('llama a deleteMany con id y organizationId del tenant', async () => {
    const prisma = makePrisma();
    const service = new CustomersService(prisma as never);

    await run(() => service.remove('c-1'));

    const deleteArg = prisma.customer.deleteMany.mock.calls[0]![0] as {
      where: { id: string; organizationId: string };
    };
    expect(deleteArg.where.id).toBe('c-1');
    expect(deleteArg.where.organizationId).toBe(ORG);
  });

  it('devuelve undefined (void)', async () => {
    const prisma = makePrisma();
    const service = new CustomersService(prisma as never);

    const result = await run(() => service.remove('c-1'));
    expect(result).toBeUndefined();
  });

  it('lanza si no hay contexto de tenant', async () => {
    const service = new CustomersService(makePrisma() as never);
    await expect(service.remove('c-1')).rejects.toThrow();
  });
});
