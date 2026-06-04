import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { assertStoreAccess, type UserStoreReader } from './store-access.js';

const STORE = '22222222-2222-2222-2222-222222222222';

function makeReader(membership: { storeId: string } | null): {
  prisma: UserStoreReader;
  findFirst: ReturnType<typeof vi.fn>;
} {
  const findFirst = vi.fn(async () => membership);
  return { prisma: { userStore: { findFirst } } as unknown as UserStoreReader, findFirst };
}

describe('assertStoreAccess', () => {
  it('ADMIN accede a cualquier tienda sin consultar UserStore', async () => {
    const { prisma, findFirst } = makeReader(null);
    await expect(
      assertStoreAccess(prisma, { userId: 'u1', role: 'ADMIN', storeId: STORE }),
    ).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('MANAGER accede a cualquier tienda sin consultar UserStore', async () => {
    const { prisma, findFirst } = makeReader(null);
    await expect(
      assertStoreAccess(prisma, { userId: 'u1', role: 'MANAGER', storeId: STORE }),
    ).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('CLERK con asignación a la tienda: permite y filtra por userId + storeId', async () => {
    const { prisma, findFirst } = makeReader({ storeId: STORE });
    await expect(
      assertStoreAccess(prisma, { userId: 'u1', role: 'CLERK', storeId: STORE }),
    ).resolves.toBeUndefined();
    const arg = findFirst.mock.calls[0]![0] as { where: { userId: string; storeId: string } };
    expect(arg.where).toEqual({ userId: 'u1', storeId: STORE });
  });

  it('CLERK sin asignación a la tienda: lanza 403 (cierre del IDOR SEC-01)', async () => {
    const { prisma } = makeReader(null);
    await expect(
      assertStoreAccess(prisma, { userId: 'u1', role: 'CLERK', storeId: STORE }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('un rol desconocido se trata como acotado por tienda (deny por defecto)', async () => {
    const { prisma } = makeReader(null);
    await expect(
      assertStoreAccess(prisma, { userId: 'u1', role: 'OTRO', storeId: STORE }),
    ).rejects.toThrow(ForbiddenException);
  });
});
