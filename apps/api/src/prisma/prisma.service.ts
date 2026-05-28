import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@simpletpv/db';

import { getCurrentTenant } from './tenant-context.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL_APP o DATABASE_URL debe estar definida para arrancar PrismaService',
      );
    }
    // Prisma 7 ya no acepta datasources.db.url en el constructor — usa adapter.
    const adapter = new PrismaPg({ connectionString: url });
    super({
      adapter,
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

// Cliente extendido con RLS: cada query corre dentro de una transacción que
// primero ejecuta set_config(..., true) (LOCAL = vive en la tx) y luego
// re-emite la operación sobre el cliente transaccional `tx`. Esto es
// imprescindible porque `query(args)` del $extends API ejecuta en el cliente
// padre (fuera de la tx), por lo que el set_config no se aplica a la query
// subsiguiente — RLS bloquearía todo. Re-emitir sobre `tx` garantiza misma
// conexión y misma transacción.
//
// organizationId proviene del JWT (TenantContextInterceptor) y entra al storage;
// además usamos $executeRaw parametrizado como defensa en profundidad.
// Sin contexto → query corre sin tx ni set_config → RLS devuelve 0 filas
// (fail-safe), siempre que la policy SQL use NULLIF para tratar '' como NULL.
export function applyTenantExtension(client: PrismaService) {
  return client.$extends({
    query: {
      async $allOperations({ args, query, model, operation }) {
        const tenant = getCurrentTenant();
        if (!tenant) {
          return query(args);
        }
        return client.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${tenant.organizationId}, true)`;
          // Re-emitir la operación sobre `tx` (no llamar a `query(args)`,
          // que volvería al cliente padre fuera de la tx).
          if (!model) {
            // Operaciones que no tienen modelo (p.ej. $queryRaw): fallback a query.
            return query(args);
          }
          // El cliente Prisma indexa modelos por nombre lowercase de la primera letra.
          const delegate = (
            tx as unknown as Record<string, Record<string, (a: unknown) => unknown>>
          )[model.charAt(0).toLowerCase() + model.slice(1)];
          if (!delegate) {
            return query(args);
          }
          const fn = delegate[operation];
          if (typeof fn !== 'function') {
            return query(args);
          }
          return fn.call(delegate, args);
        });
      },
    },
  });
}
