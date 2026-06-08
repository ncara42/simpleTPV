import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
} from '@nestjs/common';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { Roles } from '../auth/roles.decorator.js';
import { isFeatureKey } from './feature-flags.catalog.js';
import { SetFeatureFlagDto } from './feature-flags.dto.js';
import { FeatureFlagService } from './feature-flags.service.js';

// Gestión de feature flags (#127 B). Función de central → ADMIN/MANAGER. El servicio
// aplica assertStoreAccess al fijar un flag de tienda (SEC-01: un MANAGER solo gestiona
// sus tiendas). La RESOLUCIÓN efectiva para el frontend está en GET /me/features.
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly features: FeatureFlagService) {}

  // Catálogo + filas explícitas del tenant, para pintar la matriz módulos × tiendas.
  @Get()
  @Roles('ADMIN', 'MANAGER')
  list() {
    return this.features.list();
  }

  // Upsert de un flag explícito (org si no hay storeId; override de tienda si lo hay).
  @Put()
  @Roles('ADMIN', 'MANAGER')
  setFlag(@Body() body: SetFeatureFlagDto, @Req() req: { user: JwtPayload }) {
    return this.features.setFlag(body.key as never, body.enabled, body.storeId, {
      userId: req.user.sub,
      role: req.user.role,
    });
  }

  // Quita el flag explícito → vuelve al default de org (o del código). storeId opcional
  // por query (ausente = quita el default de org; presente = quita el override de tienda).
  @Delete(':key')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(204)
  clearFlag(
    @Param('key') key: string,
    @Req() req: { user: JwtPayload },
    @Query('storeId', new ParseUUIDPipe({ optional: true })) storeId?: string,
  ) {
    if (!isFeatureKey(key)) {
      throw new BadRequestException('Módulo no válido.');
    }
    return this.features.clearFlag(key, storeId, {
      userId: req.user.sub,
      role: req.user.role,
    });
  }
}
