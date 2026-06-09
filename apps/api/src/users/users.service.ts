import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@simpletpv/db';
import bcrypt from 'bcryptjs';

import { type ImportResult, parseCsv, rowNumber } from '../common/csv.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import type { CreateUserDto, UpdateUserDto } from './users.dto.js';

const SALT_ROUNDS = 10;
// Email válido (mismo criterio laxo que class-validator @IsEmail para el alta manual).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Campos seguros para devolver al cliente: NUNCA passwordHash ni pinHash.
const PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

// Tipo de usuario público derivado del select: garantiza en compilación que la
// respuesta nunca incluye passwordHash/pinHash.
export type PublicUser = Prisma.UserGetPayload<{ select: typeof PUBLIC_SELECT }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUserDto): Promise<PublicUser> {
    const tenant = requireTenant();
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

  async findAll(): Promise<PublicUser[]> {
    return this.prisma.user.findMany({ orderBy: { name: 'asc' }, select: PUBLIC_SELECT });
  }

  // Alta de usuarios en lote desde CSV (columnas: email,name,password,role).
  // Valida cada fila con el mismo criterio que el alta manual; las válidas se
  // crean y las inválidas se reportan por número de fila sin abortar el lote.
  async importCsv(csv: string): Promise<ImportResult> {
    const tenant = requireTenant();
    const rows = parseCsv(csv);
    const errors: ImportResult['errors'] = [];

    // Hash de contraseñas en paralelo solo para las filas válidas.
    const prepared: Array<{ email: string; name: string; password: string; role: UserRole }> = [];
    rows.forEach((cells, idx) => {
      const row = rowNumber(idx);
      const email = (cells.email ?? '').trim().toLowerCase();
      const name = (cells.name ?? '').trim();
      const password = cells.password ?? '';
      const roleRaw = (cells.role ?? '').trim().toUpperCase();
      if (!EMAIL_RE.test(email)) {
        errors.push({ row, message: 'Email inválido' });
        return;
      }
      if (!name) {
        errors.push({ row, message: 'Falta el nombre' });
        return;
      }
      if (password.length < 8) {
        errors.push({ row, message: 'La contraseña debe tener al menos 8 caracteres' });
        return;
      }
      if (!(roleRaw in UserRole)) {
        errors.push({ row, message: 'Rol inválido (ADMIN, MANAGER o CLERK)' });
        return;
      }
      prepared.push({ email, name, password, role: roleRaw as UserRole });
    });

    let inserted = 0;
    if (prepared.length > 0) {
      const data = await Promise.all(
        prepared.map(async (u) => ({
          organizationId: tenant.organizationId,
          email: u.email,
          name: u.name,
          role: u.role,
          passwordHash: await bcrypt.hash(u.password, SALT_ROUNDS),
        })),
      );
      // skipDuplicates: un email ya existente no rompe el lote (cuenta como no insertado).
      const res = await this.prisma.user.createMany({ data, skipDuplicates: true });
      inserted = res.count;
    }
    return { inserted, errors };
  }

  // Guard interno de existencia (no se expone en ningún endpoint). Solo
  // selecciona el id para no traer hashes a memoria innecesariamente.
  private async requireExists(id: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id }, select: { id: true } });
    if (!user) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }
  }

  async update(id: string, input: UpdateUserDto): Promise<PublicUser> {
    await this.requireExists(id);
    const { password, ...rest } = input;
    const data: Prisma.UserUpdateInput = { ...rest };
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
