import type { PrismaService } from './prisma.service.js';

// Cliente transaccional de Prisma (lo que recibe el callback de $transaction).
export type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

// Callback que se ejecuta DESPUÉS de que la transacción haga commit. Para efectos
// que no deben ocurrir si la tx hace rollback (p.ej. publicar eventos en tiempo
// real, #32): si la tx falla, estos callbacks no se ejecutan.
export type AfterCommit = (fn: () => Promise<void>) => void;

// Ejecuta `fn` dentro de UNA transacción interactiva con el tenant fijado
// (set_config LOCAL = vive en la tx). Para escrituras multi-tabla que deben ser
// atómicas Y respetar RLS — la extension por-operación no sirve aquí porque
// abriría una transacción distinta por cada operación.
//
// `fn` recibe además `afterCommit(cb)`: registra efectos a ejecutar TRAS el
// commit (best-effort). Se ejecutan en orden; un fallo en uno no aborta los
// demás ni la operación (la tx ya está confirmada).
//
// IMPORTANTE: invocar con el cliente Prisma BASE (sin applyTenantExtension),
// si no se anidarían transacciones.
export async function withTenantTx<T>(
  base: PrismaService,
  organizationId: string,
  fn: (tx: TxClient, afterCommit: AfterCommit) => Promise<T>,
): Promise<T> {
  const pending: Array<() => Promise<void>> = [];
  const result = await base.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
    return fn(tx, (cb) => pending.push(cb));
  });
  // Commit OK: ejecuta los efectos post-commit. Best-effort, no propagan.
  for (const cb of pending) {
    try {
      await cb();
    } catch {
      // Un efecto post-commit fallido (p.ej. publicar un evento) no debe
      // afectar al resultado de la operación ya confirmada.
    }
  }
  return result;
}
