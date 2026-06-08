import { ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import { FEATURE_FLAGS, FEATURE_KEYS, type FeatureKey } from './feature-flags.catalog.js';

// Resolución de feature flags (#127 B). Precedencia: override de la tienda ?? default
// de la org (storeId null) ?? default del código (comportamiento actual). RLS por
// tenant: sin contexto → 0 filas → cae al default del código, nunca a "apagado".
@Injectable()
export class FeatureFlagService {
  constructor(private readonly prisma: PrismaService) {}

  // ¿Está activa la key? storeId presente → resuelve override de tienda ?? org ??
  // código; storeId ausente (módulo de central) → org ?? código. `?? ` respeta un
  // enabled=false explícito (false gana sobre el default; solo null/undefined cae).
  async isEnabled(key: FeatureKey, storeId?: string): Promise<boolean> {
    const { organizationId } = requireTenant();
    // Trae el default de org (storeId null) y, si hay tienda, su override. Se usa OR
    // (no `in: [storeId, null]`): a nivel SQL `IN (x, NULL)` NO casa filas con NULL.
    const rows = await this.prisma.featureFlag.findMany({
      where: {
        organizationId,
        key,
        ...(storeId ? { OR: [{ storeId }, { storeId: null }] } : { storeId: null }),
      },
      select: { storeId: true, enabled: true },
    });
    const store = storeId ? rows.find((r) => r.storeId === storeId) : undefined;
    const org = rows.find((r) => r.storeId === null);
    return store?.enabled ?? org?.enabled ?? FEATURE_FLAGS[key].default;
  }

  // Lanza 403 si la key está apagada. Mismo estilo que assertStoreAccess: se llama
  // dentro del servicio, donde el storeId y el tenant ya están a mano.
  async assertEnabled(key: FeatureKey, storeId?: string): Promise<void> {
    if (!(await this.isEnabled(key, storeId))) {
      throw new ForbiddenException(`Módulo no disponible: ${FEATURE_FLAGS[key].label}`);
    }
  }

  // Estado efectivo de TODAS las keys (para que el frontend oculte/des­habilite UI).
  // Una sola query: trae los defaults de org + (si hay storeId) los overrides de esa
  // tienda, y resuelve cada key con la misma precedencia que isEnabled.
  async resolveAll(storeId?: string): Promise<Record<FeatureKey, boolean>> {
    const { organizationId } = requireTenant();
    const rows = await this.prisma.featureFlag.findMany({
      where: {
        organizationId,
        ...(storeId ? { OR: [{ storeId }, { storeId: null }] } : { storeId: null }),
      },
      select: { key: true, storeId: true, enabled: true },
    });
    const result = {} as Record<FeatureKey, boolean>;
    for (const key of FEATURE_KEYS) {
      const store = storeId ? rows.find((r) => r.key === key && r.storeId === storeId) : undefined;
      const org = rows.find((r) => r.key === key && r.storeId === null);
      result[key] = store?.enabled ?? org?.enabled ?? FEATURE_FLAGS[key].default;
    }
    return result;
  }
}
