import { Controller, Get, Req } from '@nestjs/common';
import type { Store } from '@simpletpv/db';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StoresService } from '../stores/stores.service.js';

// Recursos del usuario autenticado. Sin @Roles: solo lo protege el AuthGuard
// global, así que cualquier autenticado (incluido CLERK) puede acceder.
// El TPV (cajeros) necesita listar las tiendas de su organización para el
// selector de tienda; no puede usar GET /stores porque ese controller es
// solo-ADMIN por diseño. RLS aísla las tiendas por organización.
@Controller('me')
export class MeController {
  constructor(
    private readonly stores: StoresService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('stores')
  findStores(): Promise<Store[]> {
    return this.stores.findAll();
  }

  // Perfil del usuario autenticado: rol + tiendas asignadas.
  // El backoffice lo usa para restringir la vista del MANAGER a sus tiendas.
  @Get()
  async me(@Req() req: { user: JwtPayload }): Promise<{ role: string; storeIds: string[] }> {
    const rows = await this.prisma.userStore.findMany({
      where: { userId: req.user.sub },
      select: { storeId: true },
    });
    return { role: req.user.role, storeIds: rows.map((r) => r.storeId) };
  }
}
