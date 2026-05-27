import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
    super({
      datasources: { db: { url } },
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

// Cliente extendido con RLS: cada query envuelve set_config(..., true) en una
// transacción con el organizationId del AsyncLocalStorage. UUID validado por
// TenantMiddleware antes de entrar al storage; además usamos $executeRaw
// parametrizado (sin interpolación de strings) como defensa en profundidad.
// El tercer argumento `true` de set_config = LOCAL (vive en la transacción).
// Sin contexto → query corre sin set_config → RLS devuelve 0 filas (fail-safe).
//
// Nota: el `query(args)` se ejecuta como llamada al cliente padre, no a `tx`.
// El test de integración en test/rls.integration.spec.ts verifica que la
// sesión sí queda aplicada para la query subsiguiente (mismo connection del
// pool dentro de $transaction). Si en ejecución se observa filtrado incorrecto,
// migrar a $use middleware o wrapper a nivel servicio según sugiere la doc de
// Prisma para multi-tenancy con RLS.
export function applyTenantExtension(client: PrismaService) {
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        const tenant = getCurrentTenant();
        if (!tenant) {
          return query(args);
        }
        return client.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${tenant.organizationId}, true)`;
          return query(args);
        });
      },
    },
  });
}
