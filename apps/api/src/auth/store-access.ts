import { ForbiddenException } from '@nestjs/common';

// Roles con acceso a TODA la organización (no acotados por tienda). Coherente con
// salesStoreFilter (sales.service.ts): ADMIN/MANAGER operan sobre cualquier tienda
// de su organización por diseño; el resto (CLERK) queda acotado a sus tiendas.
const ORG_WIDE_ROLES: ReadonlySet<string> = new Set(['ADMIN', 'MANAGER']);

// Puerto mínimo de lectura sobre UserStore. Lo cumplen tanto el cliente Prisma
// extendido (this.prisma) como el transaccional (el `tx` de withTenantTx), para
// poder comprobar el acceso dentro o fuera de una transacción.
export interface UserStoreReader {
  userStore: {
    findFirst(args: {
      where: { userId: string; storeId: string };
      select: { storeId: true };
    }): Promise<{ storeId: string } | null>;
  };
}

/**
 * Verifica que el usuario puede operar sobre `storeId`; lanza 403 si no.
 *
 * Cierra el IDOR horizontal entre tiendas (auditoría SEC-01): la RLS aísla por
 * ORGANIZACIÓN pero no por tienda, así que sin esta comprobación un CLERK podría
 * operar sobre cualquier tienda de su organización pasando otro `storeId`
 * (vender, abrir/cerrar caja, devolver, recibir traspasos, fichar, etc.).
 *
 * Política (idéntica a salesStoreFilter): ADMIN/MANAGER acceden a toda la org; el
 * resto requiere una asignación explícita en UserStore. La consulta filtra por el
 * `userId` del JWT, así que solo casa con las asignaciones del propio usuario; un
 * `storeId` de otra tienda (o de otra organización) no devuelve fila → 403.
 */
export async function assertStoreAccess(
  prisma: UserStoreReader,
  params: { userId: string; role: string; storeId: string },
): Promise<void> {
  if (ORG_WIDE_ROLES.has(params.role)) {
    return;
  }
  const membership = await prisma.userStore.findFirst({
    where: { userId: params.userId, storeId: params.storeId },
    select: { storeId: true },
  });
  if (!membership) {
    throw new ForbiddenException('No tienes acceso a esa tienda');
  }
}
