import { describe, expect, it, vi } from 'vitest';

import { tenantStorage } from '../prisma/tenant-context.js';
import { ProductFamiliesService } from './product-families.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

interface FakeFamily {
  id: string;
  organizationId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  isArchetype?: boolean;
}

function makePrisma(families: FakeFamily[] = []) {
  return {
    productFamily: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'f-new',
        ...data,
      })),
      findMany: vi.fn(async (): Promise<FakeFamily[]> => families),
      findFirst: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          families.find((f) => f.id === where.id) ?? null,
      ),
      count: vi.fn(
        async ({ where }: { where: { parentId: string } }) =>
          families.filter((f) => f.parentId === where.parentId).length,
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'f1', ...data })),
      delete: vi.fn(async () => ({ id: 'f1' })),
    },
  };
}

describe('ProductFamiliesService.create', () => {
  it('crea una familia raíz con el organizationId del tenant', async () => {
    const prisma = makePrisma();
    const service = new ProductFamiliesService(prisma as never);
    const result = await tenantStorage.run({ organizationId: ORG }, () =>
      service.create({ name: 'Bebidas' }),
    );
    const arg = prisma.productFamily.create.mock.calls[0]![0] as {
      data: { organizationId: string; name: string };
    };
    expect(arg.data.organizationId).toBe(ORG);
    expect(arg.data.name).toBe('Bebidas');
    expect(result).toMatchObject({ name: 'Bebidas' });
  });
});

describe('ProductFamiliesService.findTree', () => {
  it('devuelve raíces con sus hijos anidados', async () => {
    const families: FakeFamily[] = [
      { id: 'r1', organizationId: ORG, parentId: null, name: 'Bebidas', sortOrder: 0 },
      { id: 'c1', organizationId: ORG, parentId: 'r1', name: 'Refrescos', sortOrder: 0 },
      { id: 'c2', organizationId: ORG, parentId: 'r1', name: 'Aguas', sortOrder: 1 },
      { id: 'r2', organizationId: ORG, parentId: null, name: 'Snacks', sortOrder: 1 },
    ];
    const prisma = makePrisma(families);
    const service = new ProductFamiliesService(prisma as never);

    const tree = (await service.findTree()) as Array<{ id: string; children: unknown[] }>;

    expect(tree).toHaveLength(2); // 2 raíces
    const bebidas = tree.find((n) => n.id === 'r1')!;
    expect(bebidas.children).toHaveLength(2);
    const snacks = tree.find((n) => n.id === 'r2')!;
    expect(snacks.children).toHaveLength(0);
  });
});

describe('ProductFamiliesService.update (anti-ciclos)', () => {
  const families: FakeFamily[] = [
    { id: 'r1', organizationId: ORG, parentId: null, name: 'Bebidas', sortOrder: 0 },
    { id: 'c1', organizationId: ORG, parentId: 'r1', name: 'Refrescos', sortOrder: 0 },
    { id: 'g1', organizationId: ORG, parentId: 'c1', name: 'Cola', sortOrder: 0 },
  ];

  it('actualiza el nombre de una familia existente', async () => {
    const prisma = makePrisma(families);
    const service = new ProductFamiliesService(prisma as never);
    await service.update('c1', { name: 'Refrescos y zumos' });
    expect(prisma.productFamily.update).toHaveBeenCalledOnce();
  });

  it('rechaza ponerse a sí misma como parent', async () => {
    const prisma = makePrisma(families);
    const service = new ProductFamiliesService(prisma as never);
    await expect(service.update('r1', { parentId: 'r1' })).rejects.toThrow();
  });

  it('rechaza poner como parent a un descendiente (ciclo)', async () => {
    // r1 → c1 → g1 ; mover r1 bajo g1 crearía un ciclo
    const prisma = makePrisma(families);
    const service = new ProductFamiliesService(prisma as never);
    await expect(service.update('r1', { parentId: 'g1' })).rejects.toThrow();
  });

  it('permite reparentar a una familia no relacionada', async () => {
    const fams: FakeFamily[] = [
      { id: 'r1', organizationId: ORG, parentId: null, name: 'A', sortOrder: 0 },
      { id: 'r2', organizationId: ORG, parentId: null, name: 'B', sortOrder: 1 },
    ];
    const prisma = makePrisma(fams);
    const service = new ProductFamiliesService(prisma as never);
    await service.update('r2', { parentId: 'r1' });
    expect(prisma.productFamily.update).toHaveBeenCalledOnce();
  });
});

describe('ProductFamiliesService (reglas de arquetipo)', () => {
  it('rechaza crear una subfamilia bajo un arquetipo', async () => {
    const fams: FakeFamily[] = [
      {
        id: 'arq',
        organizationId: ORG,
        parentId: null,
        name: 'Crema camomila',
        sortOrder: 0,
        isArchetype: true,
      },
    ];
    const prisma = makePrisma(fams);
    const service = new ProductFamiliesService(prisma as never);
    await expect(
      tenantStorage.run({ organizationId: ORG }, () =>
        service.create({ name: 'Sub', parentId: 'arq' }),
      ),
    ).rejects.toThrow(/arquetipo solo puede contener productos/i);
    expect(prisma.productFamily.create).not.toHaveBeenCalled();
  });

  it('rechaza mover una familia bajo un arquetipo', async () => {
    const fams: FakeFamily[] = [
      {
        id: 'arq',
        organizationId: ORG,
        parentId: null,
        name: 'Arq',
        sortOrder: 0,
        isArchetype: true,
      },
      { id: 'f1', organizationId: ORG, parentId: null, name: 'F1', sortOrder: 1 },
    ];
    const prisma = makePrisma(fams);
    const service = new ProductFamiliesService(prisma as never);
    await expect(service.update('f1', { parentId: 'arq' })).rejects.toThrow(
      /arquetipo solo puede contener productos/i,
    );
    expect(prisma.productFamily.update).not.toHaveBeenCalled();
  });

  it('rechaza marcar como arquetipo un nodo con subfamilias', async () => {
    const fams: FakeFamily[] = [
      { id: 'r1', organizationId: ORG, parentId: null, name: 'Cosmética', sortOrder: 0 },
      { id: 'c1', organizationId: ORG, parentId: 'r1', name: 'Facial', sortOrder: 0 },
    ];
    const prisma = makePrisma(fams);
    const service = new ProductFamiliesService(prisma as never);
    await expect(service.update('r1', { isArchetype: true })).rejects.toThrow(
      /arquetipo.*subfamilias|subfamilias.*arquetipo/i,
    );
    expect(prisma.productFamily.update).not.toHaveBeenCalled();
  });

  it('permite marcar como arquetipo un nodo hoja (sin subfamilias)', async () => {
    const fams: FakeFamily[] = [
      {
        id: 'leaf',
        organizationId: ORG,
        parentId: null,
        name: 'Crema camomila 100ml',
        sortOrder: 0,
      },
    ];
    const prisma = makePrisma(fams);
    const service = new ProductFamiliesService(prisma as never);
    await service.update('leaf', { isArchetype: true });
    expect(prisma.productFamily.update).toHaveBeenCalledOnce();
  });
});

describe('ProductFamiliesService.remove', () => {
  it('borra una familia existente', async () => {
    const fams: FakeFamily[] = [
      { id: 'r1', organizationId: ORG, parentId: null, name: 'A', sortOrder: 0 },
    ];
    const prisma = makePrisma(fams);
    const service = new ProductFamiliesService(prisma as never);
    await service.remove('r1');
    expect(prisma.productFamily.delete).toHaveBeenCalledOnce();
  });
});
