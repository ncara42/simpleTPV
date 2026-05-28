import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service.js';
import { getCurrentTenant } from '../prisma/tenant-context.js';

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: 'ADMIN' | 'MANAGER' | 'CLERK';
}

export interface UpdateUserInput {
  name?: string;
  role?: 'ADMIN' | 'MANAGER' | 'CLERK';
  active?: boolean;
  password?: string;
}

const SALT_ROUNDS = 10;

// Campos seguros para devolver al cliente: NUNCA passwordHash ni pinHash.
const PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUserInput): Promise<unknown> {
    const tenant = getCurrentTenant();
    if (!tenant) {
      throw new InternalServerErrorException('Sin contexto de tenant');
    }
    const { password, ...rest } = input;
    return this.prisma.user.create({
      data: {
        ...rest,
        organizationId: tenant.organizationId,
        passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
      },
      select: PUBLIC_SELECT,
    });
  }

  async findAll(): Promise<unknown[]> {
    return this.prisma.user.findMany({ orderBy: { name: 'asc' }, select: PUBLIC_SELECT });
  }

  // Guard interno de existencia (no se expone en ningún endpoint). Solo
  // selecciona el id para no traer hashes a memoria innecesariamente.
  private async requireExists(id: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id }, select: { id: true } });
    if (!user) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }
  }

  async update(id: string, input: UpdateUserInput): Promise<unknown> {
    await this.requireExists(id);
    const { password, ...rest } = input;
    const data: Record<string, unknown> = { ...rest };
    if (password) {
      data.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    }
    return this.prisma.user.update({ where: { id }, data, select: PUBLIC_SELECT });
  }

  async remove(id: string): Promise<void> {
    await this.requireExists(id);
    await this.prisma.user.delete({ where: { id } });
  }

  async setPin(id: string, pin: string): Promise<void> {
    await this.requireExists(id);
    await this.prisma.user.update({
      where: { id },
      data: { pinHash: await bcrypt.hash(pin, SALT_ROUNDS) },
    });
  }

  async assignStores(id: string, storeIds: string[]): Promise<void> {
    await this.requireExists(id);
    // UserStore no tiene RLS propia: validamos que cada storeId pertenezca al
    // tenant actual a través del modelo Store (sí protegido por RLS) antes de
    // insertar. Sin esto, un ADMIN podría enlazar su usuario con tiendas de otra
    // organización (rotura de aislamiento multi-tenant).
    const uniqueStoreIds = [...new Set(storeIds)];
    if (uniqueStoreIds.length > 0) {
      const owned = await this.prisma.store.findMany({
        where: { id: { in: uniqueStoreIds } },
        select: { id: true },
      });
      if (owned.length !== uniqueStoreIds.length) {
        throw new BadRequestException('Alguna tienda no existe o no pertenece a la organización');
      }
    }
    await this.prisma.userStore.deleteMany({ where: { userId: id } });
    await this.prisma.userStore.createMany({
      data: uniqueStoreIds.map((storeId) => ({ userId: id, storeId })),
    });
  }
}
