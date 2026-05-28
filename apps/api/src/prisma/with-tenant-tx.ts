import type { PrismaService } from './prisma.service.js';

// Cliente transaccional de Prisma (lo que recibe el callback de $transaction).
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

// Ejecuta `fn` dentro de UNA transacción interactiva con el tenant fijado
// (set_config LOCAL = vive en la tx). Para escrituras multi-tabla que deben ser
// atómicas Y respetar RLS — la extension por-operación no sirve aquí porque
// abriría una transacción distinta por cada operación.
//
// IMPORTANTE: invocar con el cliente Prisma BASE (sin applyTenantExtension),
// si no se anidarían transacciones.
export function withTenantTx<T>(
  base: PrismaService,
  organizationId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return base.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
    return fn(tx);
  });
}
