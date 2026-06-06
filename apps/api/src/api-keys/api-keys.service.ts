import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { requireFound } from '../common/tenant-scope.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { ApiKeyLookupService } from './api-key-lookup.service.js';
import type { CreateApiKeyDto } from './api-keys.dto.js';

// Genera una key con formato: stpv_<prefix8>_<random43>
// La key completa se muestra UNA VEZ; en BD solo se almacena sha256(key).
function generateRawKey(): { raw: string; prefix: string } {
  const rand = randomBytes(32).toString('base64url');
  const prefix = rand.slice(0, 8);
  return { raw: `stpv_${prefix}_${rand}`, prefix };
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(dto: CreateApiKeyDto): Promise<{
    id: string;
    name: string;
    prefix: string;
    key: string;
  }> {
    const { organizationId } = requireTenant();
    const { raw, prefix } = generateRawKey();
    const hashedKey = ApiKeyLookupService.hashKey(raw);

    const record = await this.prisma.apiKey.create({
      data: {
        organizationId,
        name: dto.name,
        prefix,
        hashedKey,
        priceListId: dto.priceListId ?? null,
      },
      select: { id: true, name: true, prefix: true },
    });

    return { ...record, key: raw };
  }

  async list() {
    const { organizationId } = requireTenant();
    return this.prisma.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        priceListId: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    });
  }

  async revoke(id: string): Promise<void> {
    const { organizationId } = requireTenant();
    await requireFound(
      this.prisma.apiKey.findFirst({ where: { id, organizationId }, select: { id: true } }),
      'API key no encontrada',
    );
    await this.prisma.apiKey.updateMany({
      where: { id, organizationId },
      data: { revokedAt: new Date() },
    });
  }
}
