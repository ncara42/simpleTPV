// Token DI para el cliente Prisma BASE (sin applyTenantExtension).
//
// El token `PrismaService` expone el cliente EXTENDIDO (RLS por-operación),
// que es lo que consumen la mayoría de servicios. Para escrituras multi-tabla
// atómicas se necesita el cliente BASE, porque `withTenantTx` debe abrir UNA
// sola transacción: si recibiera el extendido, cada operación dentro del
// callback volvería a disparar `$allOperations` y abriría transacciones
// anidadas distintas, perdiéndose la atomicidad.
//
// Inyéctalo con `@Inject(PRISMA_BASE)`.
export const PRISMA_BASE = Symbol('PRISMA_BASE');
