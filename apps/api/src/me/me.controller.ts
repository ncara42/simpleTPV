import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Store } from '@simpletpv/db';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { type FeatureKey } from '../feature-flags/feature-flags.catalog.js';
import { FeatureFlagService } from '../feature-flags/feature-flags.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StoresService } from '../stores/stores.service.js';
import { SetPreferenceDto } from './preferences.dto.js';
import { PreferencesService } from './preferences.service.js';

// Clave de preferencia: ámbito en kebab/dot (p.ej. 'dashboard.cards'), acotada.
const PREF_KEY = /^[a-zA-Z0-9._-]{1,64}$/;

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
    private readonly prefs: PreferencesService,
    private readonly features: FeatureFlagService,
  ) {}

  @Get('stores')
  findStores(): Promise<Store[]> {
    return this.stores.findAll();
  }

  // Estado efectivo de los feature flags (#127 B) para que el frontend oculte/
  // des­habilite UI. Con storeId resuelve los overrides de esa tienda; sin él, solo
  // los defaults de la org. El backend sigue siendo la fuente de verdad (los
  // endpoints devuelven 403 si el módulo está apagado, aunque la UI lo muestre).
  @Get('features')
  getFeatures(
    @Query('storeId', new ParseUUIDPipe({ optional: true })) storeId?: string,
  ): Promise<Record<FeatureKey, boolean>> {
    return this.features.resolveAll(storeId);
  }

  // Personalización (IT-16): preferencias del usuario autenticado. Cada uno solo ve
  // y edita las suyas (se usa siempre req.user.sub).
  @Get('preferences')
  preferences(@Req() req: { user: JwtPayload }): Promise<Record<string, unknown>> {
    return this.prefs.getAll(req.user.sub);
  }

  @Put('preferences/:key')
  setPreference(
    @Req() req: { user: JwtPayload },
    @Param('key') key: string,
    @Body() body: SetPreferenceDto,
  ): Promise<{ key: string; value: unknown }> {
    if (!PREF_KEY.test(key)) {
      throw new BadRequestException('Clave de preferencia no válida.');
    }
    return this.prefs.set(req.user.sub, key, body.value);
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
