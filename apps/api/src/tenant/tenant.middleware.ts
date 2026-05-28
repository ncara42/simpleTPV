import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { tenantStorage } from '../prisma/tenant-context.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rutas que NO requieren contexto de tenant.
// /health debe responder aunque no haya tenant ni DB.
// Match exacto o con query string (ej. /health?foo=bar).
const EXEMPT_PATHS = ['/health'];

function isExempt(req: Request): boolean {
  // Cuando Nest aplica el middleware con forRoutes('*') en un sub-router,
  // req.path y req.url se ven como '/'. originalUrl preserva la ruta real
  // tal y como llegó al servidor (sin query string la separamos manualmente).
  const url = req.originalUrl ?? req.url ?? '';
  const path = url.split('?')[0] ?? '';
  return EXEMPT_PATHS.some((p) => path === p || path.startsWith(p + '/'));
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (isExempt(req)) {
      next();
      return;
    }

    const orgId = req.header('X-Org-Id');
    if (!orgId || !UUID_RE.test(orgId)) {
      throw new BadRequestException('X-Org-Id header obligatorio y debe ser UUID v4 válido');
    }

    tenantStorage.run({ organizationId: orgId }, () => next());
  }
}
