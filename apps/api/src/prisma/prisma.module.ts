import { Global, Module } from '@nestjs/common';

import { applyTenantExtension, PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: () => {
        const client = new PrismaService();
        return applyTenantExtension(client) as unknown as PrismaService;
      },
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
