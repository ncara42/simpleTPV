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

// Cliente extendido con RLS: cada query envuelve SET LOCAL en una transacción
// con el organizationId del AsyncLocalStorage. UUID validado por TenantMiddleware
// antes de entrar al storage (no hay riesgo de SQL injection vía organizationId).
// Sin contexto → query corre sin SET LOCAL → RLS devuelve 0 filas (fail-safe).
export function applyTenantExtension(client: PrismaService) {
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        const tenant = getCurrentTenant();
        if (!tenant) {
          return query(args);
        }
        return client.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SET LOCAL app.current_organization_id = '${tenant.organizationId}'`,
          );
          return query(args);
        });
      },
    },
  });
}
