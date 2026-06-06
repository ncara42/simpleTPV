import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@simpletpv/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';

// Personalización por usuario (IT-16): preferencias clave-valor (JSON). Cada usuario
// solo lee/escribe las suyas (el controller pasa SIEMPRE req.user.sub); RLS aísla por
// tenant. Cota de tamaño por preferencia para evitar abuso.
const MAX_VALUE_BYTES = 16 * 1024; // 16 KB

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  // Todas las preferencias del usuario como mapa key→value.
  async getAll(userId: string): Promise<Record<string, unknown>> {
    const rows = await this.prisma.userPreference.findMany({
      where: { userId },
      select: { key: true, value: true },
    });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  // Upsert de una preferencia del usuario (clave única por usuario).
  async set(userId: string, key: string, value: unknown): Promise<{ key: string; value: unknown }> {
    const tenant = requireTenant();
    if (Buffer.byteLength(JSON.stringify(value ?? null), 'utf8') > MAX_VALUE_BYTES) {
      throw new PayloadTooLargeException('La preferencia supera el tamaño máximo.');
    }
    const json: Prisma.InputJsonValue | typeof Prisma.JsonNull =
      value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
    const saved = await this.prisma.userPreference.upsert({
      where: { userId_key: { userId, key } },
      create: { organizationId: tenant.organizationId, userId, key, value: json },
      update: { value: json },
      select: { key: true, value: true },
    });
    return saved;
  }
}
