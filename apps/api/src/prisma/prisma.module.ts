import { Global, Module } from '@nestjs/common';

import { applyTenantExtension, PrismaService } from './prisma.service.js';
import { PRISMA_BASE } from './prisma.tokens.js';

@Global()
@Module({
  providers: [
    // Cliente BASE: instancia real con lifecycle hooks (onModuleInit → $connect).
    // Es la que abre la conexión real. El extendido la envuelve y comparte su pool.
    {
      provide: PRISMA_BASE,
      useFactory: () => new PrismaService(),
    },
    // Cliente EXTENDIDO (RLS por-operación): envuelve la MISMA instancia base.
    // Conectar el base basta para ambos, así que no implementa lifecycle propio.
    {
      provide: PrismaService,
      useFactory: (base: PrismaService) => applyTenantExtension(base) as unknown as PrismaService,
      inject: [PRISMA_BASE],
    },
  ],
  exports: [PrismaService, PRISMA_BASE],
})
export class PrismaModule {}
