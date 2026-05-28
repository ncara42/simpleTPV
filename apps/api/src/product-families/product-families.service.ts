import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { getCurrentTenant } from '../prisma/tenant-context.js';

export interface CreateFamilyInput {
  name: string;
  parentId?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export type UpdateFamilyInput = Partial<CreateFamilyInput>;

export interface FamilyNode {
  id: string;
  parentId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  children: FamilyNode[];
}

@Injectable()
export class ProductFamiliesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateFamilyInput): Promise<unknown> {
    const tenant = getCurrentTenant();
    if (!tenant) {
      throw new InternalServerErrorException('Sin contexto de tenant');
    }
    if (input.parentId) {
      await this.requireExists(input.parentId);
    }
    return this.prisma.productFamily.create({
      data: { ...input, organizationId: tenant.organizationId },
    });
  }

  async findTree(): Promise<FamilyNode[]> {
    const rows = (await this.prisma.productFamily.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })) as Array<Omit<FamilyNode, 'children'>>;

    const byId = new Map<string, FamilyNode>();
    for (const r of rows) {
      byId.set(r.id, { ...r, children: [] });
    }
    const roots: FamilyNode[] = [];
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async update(id: string, input: UpdateFamilyInput): Promise<unknown> {
    await this.requireExists(id);
    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === id) {
        throw new BadRequestException('Una familia no puede ser su propio padre');
      }
      await this.requireExists(input.parentId);
      await this.assertNoCycle(id, input.parentId);
    }
    return this.prisma.productFamily.update({ where: { id }, data: input });
  }

  async remove(id: string): Promise<void> {
    await this.requireExists(id);
    await this.prisma.productFamily.delete({ where: { id } });
  }

  // Sube por la cadena de ancestros del nuevo padre; si aparece `id`, mover
  // `id` bajo `newParentId` crearía un ciclo.
  private async assertNoCycle(id: string, newParentId: string): Promise<void> {
    let cursor: string | null = newParentId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === id) {
        throw new BadRequestException('Movimiento inválido: crearía un ciclo en la jerarquía');
      }
      if (visited.has(cursor)) {
        break;
      }
      visited.add(cursor);
      const node = await this.requireExists(cursor);
      cursor = node.parentId;
    }
  }

  private async requireExists(id: string): Promise<{ id: string; parentId: string | null }> {
    const family = (await this.prisma.productFamily.findFirst({ where: { id } })) as {
      id: string;
      parentId: string | null;
    } | null;
    if (!family) {
      throw new NotFoundException(`Familia ${id} no encontrada`);
    }
    return family;
  }
}
