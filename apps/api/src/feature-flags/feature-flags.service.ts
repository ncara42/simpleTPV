import { ForbiddenException, Injectable } from '@nestjs/common';

import { assertStoreAccess } from '../auth/store-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireTenant } from '../prisma/tenant-context.js';
import {
  FEATURE_FLAG_CATALOG,
  FEATURE_FLAGS,
  FEATURE_KEYS,
  type FeatureKey,
} from './feature-flags.catalog.js';

// El actor que gestiona los flags: lo necesita assertStoreAccess para acotar a un
// MANAGER a sus tiendas (SEC-01) al fijar un flag a nivel de tienda.
interface Actor {
  userId: string;
  role: string;
}

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

  // ── Gestión (#127 B slice 2): ADMIN/MANAGER fijan/quitan flags por org/tienda ──

  // Un flag a NIVEL ORG (sin storeId) afecta a TODAS las tiendas de la organización
  // → es un cambio de control-plane org-wide y se restringe a ADMIN (menor privilegio).
  // Los flags de tienda los gestiona ADMIN/MANAGER acotado por assertStoreAccess
  // (SEC-01). Defensa en profundidad sobre el @Roles('ADMIN','MANAGER') del controller.
  private assertOrgLevelAllowed(actor: Actor): void {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo un ADMIN puede cambiar el valor de un módulo a nivel de organización.',
      );
    }
  }

  // Catálogo (clave + etiqueta + default del código) + las filas explícitas del tenant
  // (defaults de org con storeId null + overrides de tienda) para pintar la matriz.
  async list(): Promise<{
    catalog: typeof FEATURE_FLAG_CATALOG;
    flags: Array<{ key: string; storeId: string | null; enabled: boolean }>;
  }> {
    const { organizationId } = requireTenant();
    const flags = await this.prisma.featureFlag.findMany({
      where: { organizationId },
      select: { key: true, storeId: true, enabled: true },
    });
    return { catalog: FEATURE_FLAG_CATALOG, flags };
  }

  // Fija (upsert) un flag explícito. storeId presente → override de tienda (requiere
  // acceso a esa tienda, SEC-01); ausente → default de la org. No se usa upsert de
  // Prisma porque el selector compuesto único incluye storeId nullable (limitación de
  // Prisma con nullables en where unique); findFirst + create/update es robusto aquí.
  async setFlag(key: FeatureKey, enabled: boolean, storeId: string | undefined, actor: Actor) {
    const { organizationId } = requireTenant();
    if (storeId) {
      await assertStoreAccess(this.prisma, { userId: actor.userId, role: actor.role, storeId });
    } else {
      this.assertOrgLevelAllowed(actor);
    }
    const existing = await this.prisma.featureFlag.findFirst({
      where: { organizationId, key, storeId: storeId ?? null },
      select: { id: true },
    });
    if (existing) {
      return this.prisma.featureFlag.update({ where: { id: existing.id }, data: { enabled } });
    }
    return this.prisma.featureFlag.create({
      data: { organizationId, key, storeId: storeId ?? null, enabled },
    });
  }

  // Quita el flag explícito → la key vuelve al default de org (si era de tienda) o al
  // default del código (si era de org). deleteMany filtra por org → no toca otro tenant.
  async clearFlag(key: FeatureKey, storeId: string | undefined, actor: Actor): Promise<void> {
    const { organizationId } = requireTenant();
    if (storeId) {
      await assertStoreAccess(this.prisma, { userId: actor.userId, role: actor.role, storeId });
    } else {
      this.assertOrgLevelAllowed(actor);
    }
    await this.prisma.featureFlag.deleteMany({
      where: { organizationId, key, storeId: storeId ?? null },
    });
  }
}
