import { Controller, Get } from '@nestjs/common';
import type { Store } from '@simpletpv/db';

import { StoresService } from '../stores/stores.service.js';

// Recursos del usuario autenticado. Sin @Roles: solo lo protege el AuthGuard
// global, así que cualquier autenticado (incluido CLERK) puede acceder.
// El TPV (cajeros) necesita listar las tiendas de su organización para el
// selector de tienda; no puede usar GET /stores porque ese controller es
// solo-ADMIN por diseño. RLS aísla las tiendas por organización.
@Controller('me')
export class MeController {
  constructor(private readonly stores: StoresService) {}

  @Get('stores')
  findStores(): Promise<Store[]> {
    return this.stores.findAll();
  }
}
