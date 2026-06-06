import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { ApiKeyLookupService } from './api-key-lookup.service.js';

export interface ApiKeyContext {
  organizationId: string;
  priceListId: string | null;
  apiKeyId: string;
}

// Guard para rutas públicas autenticadas con X-API-Key. Valida la clave,
// inyecta req.user.organizationId (para TenantContextInterceptor) y
// req.apiKey (para el controlador, con priceListId del key).
// NO corre vía APP_GUARD: se aplica per-ruta con @UseGuards(ApiKeyGuard).
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly lookup: ApiKeyLookupService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, unknown>;
      user?: { organizationId: string };
      apiKey?: ApiKeyContext;
    }>();

    const raw = req.headers['x-api-key'];
    if (typeof raw !== 'string' || !raw.startsWith('stpv_')) {
      throw new UnauthorizedException('API key inválida o ausente');
    }

    const hashedKey = ApiKeyLookupService.hashKey(raw);
    const record = await this.lookup.findByHash(hashedKey);

    if (!record) throw new UnauthorizedException('API key no reconocida');
    if (record.revokedAt) throw new UnauthorizedException('API key revocada');

    // Actualiza lastUsedAt de forma asíncrona — sin bloquear la respuesta.
    void this.lookup.touchLastUsed(record.id);

    req.user = { organizationId: record.organizationId };
    req.apiKey = {
      organizationId: record.organizationId,
      priceListId: record.priceListId,
      apiKeyId: record.id,
    };

    return true;
  }
}
