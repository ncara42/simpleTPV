import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { tenantStorage } from '../prisma/tenant-context.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rutas que NO requieren contexto de tenant.
// /health debe responder aunque no haya tenant ni DB.
const EXEMPT_PATHS = new Set<string>(['/health']);

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (EXEMPT_PATHS.has(req.path)) {
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
