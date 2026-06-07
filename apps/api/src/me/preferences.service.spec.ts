import { PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@simpletpv/db';
import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { PreferencesService } from './preferences.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = 'user-aaaa-bbbb-cccc-dddddddddddd';

/** Ejecuta fn dentro de un contexto de tenant. */
const run = <T>(fn: () => Promise<T>): Promise<T> => tenantStorage.run({ organizationId: ORG }, fn);

// ---------------------------------------------------------------------------
// Helpers de mock
// ---------------------------------------------------------------------------

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    userPreference: {
      findMany: vi.fn(async (..._a: unknown[]) => []),
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        key: create['key'],
        value: create['value'],
      })),
      ...overrides,
    },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new PreferencesService(prisma as never);
}

// ---------------------------------------------------------------------------
// getAll
// ---------------------------------------------------------------------------

describe('PreferencesService.getAll', () => {
  it('devuelve objeto vacío cuando no hay preferencias', async () => {
    const svc = makeService(makePrisma());
    const result = await svc.getAll(USER);
    expect(result).toEqual({});
  });

  it('mapea las filas key→value a un objeto plano', async () => {
    const rows = [
      { key: 'theme', value: 'dark' },
      { key: 'lang', value: 'es' },
    ];
    const prisma = makePrisma({
      findMany: vi.fn(async (..._a: unknown[]) => rows),
    });
    const svc = makeService(prisma);

    const result = await svc.getAll(USER);

    expect(result).toEqual({ theme: 'dark', lang: 'es' });
  });

  it('filtra por userId en la query', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    await svc.getAll(USER);

    const call = prisma.userPreference.findMany.mock.calls[0]![0] as {
      where: { userId: string };
    };
    expect(call.where.userId).toBe(USER);
  });

  it('acepta valores JSON arbitrarios (objeto, array, número)', async () => {
    const rows = [
      { key: 'prefs', value: { fontSize: 14, compact: true } },
      { key: 'tags', value: ['a', 'b'] },
      { key: 'zoom', value: 1.5 },
    ];
    const prisma = makePrisma({
      findMany: vi.fn(async (..._a: unknown[]) => rows),
    });
    const svc = makeService(prisma);

    const result = await svc.getAll(USER);

    expect(result['prefs']).toEqual({ fontSize: 14, compact: true });
    expect(result['tags']).toEqual(['a', 'b']);
    expect(result['zoom']).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// set
// ---------------------------------------------------------------------------

describe('PreferencesService.set', () => {
  it('llama upsert con los parámetros correctos', async () => {
    const prisma = makePrisma({
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        key: create['key'],
        value: create['value'],
      })),
    });
    const svc = makeService(prisma);

    await run(() => svc.set(USER, 'theme', 'dark'));

    const call = prisma.userPreference.upsert.mock.calls[0]![0] as {
      where: { userId_key: { userId: string; key: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(call.where.userId_key).toEqual({ userId: USER, key: 'theme' });
    expect(call.create['userId']).toBe(USER);
    expect(call.create['key']).toBe('theme');
    expect(call.create['value']).toBe('dark');
    expect(call.create['organizationId']).toBe(ORG);
    expect(call.update['value']).toBe('dark');
  });

  it('devuelve la preferencia guardada con key y value', async () => {
    const prisma = makePrisma();
    const svc = makeService(prisma);

    const result = await run(() => svc.set(USER, 'lang', 'es'));

    expect(result.key).toBe('lang');
  });

  it('lanza PayloadTooLargeException si el valor supera 16 KB', async () => {
    const svc = makeService(makePrisma());
    // Valor de 16 KB + 1 byte → supera el límite.
    const big = 'x'.repeat(16 * 1024 + 1);

    await expect(run(() => svc.set(USER, 'grande', big))).rejects.toThrow(PayloadTooLargeException);
  });

  it('NO lanza PayloadTooLargeException para un valor justo en el límite (16 KB exactos)', async () => {
    const svc = makeService(makePrisma());
    // JSON.stringify de una cadena de 16 KB incluyendo las comillas sobrepasa el límite;
    // usamos 16 * 1024 - 2 para que el stringify (que añade "") quepa exactamente.
    const exact = 'x'.repeat(16 * 1024 - 2);

    await expect(run(() => svc.set(USER, 'limite', exact))).resolves.not.toThrow();
  });

  it('usa Prisma.JsonNull cuando value es null', async () => {
    const prisma = makePrisma({
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        key: create['key'],
        value: create['value'],
      })),
    });
    const svc = makeService(prisma);

    await run(() => svc.set(USER, 'nullable', null));

    const call = prisma.userPreference.upsert.mock.calls[0]![0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    // Prisma.JsonNull es el símbolo especial que Prisma usa para guardar NULL en JSON.
    expect(call.create['value']).toBe(Prisma.JsonNull);
    expect(call.update['value']).toBe(Prisma.JsonNull);
  });

  it('pasa el valor directamente para tipos JSON válidos (no null)', async () => {
    const prisma = makePrisma({
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        key: create['key'],
        value: create['value'],
      })),
    });
    const svc = makeService(prisma);
    const obj = { x: 1, y: [2, 3] };

    await run(() => svc.set(USER, 'config', obj));

    const call = prisma.userPreference.upsert.mock.calls[0]![0] as {
      create: Record<string, unknown>;
    };
    expect(call.create['value']).toEqual(obj);
  });

  it('lanza si no hay contexto de tenant (requireTenant falla)', async () => {
    const svc = makeService(makePrisma());
    // Sin tenantStorage.run → requireTenant lanza InternalServerErrorException.
    await expect(svc.set(USER, 'key', 'value')).rejects.toThrow();
  });
});
