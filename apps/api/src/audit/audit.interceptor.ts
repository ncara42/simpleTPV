import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, tap } from 'rxjs';

import type { JwtPayload } from '../auth/jwt-payload.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { tenantStorage } from '../prisma/tenant-context.js';

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Registra cada mutación exitosa en audit_logs. Global: no hay que tocar cada
// endpoint. Corre dentro del contexto de tenant (TenantContextInterceptor), así
// que el insert en AuditLog respeta la RLS por organizationId.
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      url?: string;
      user?: JwtPayload;
    }>();

    if (!MUTATIONS.has(req.method) || !req.user) {
      return next.handle();
    }

    const path = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
    const segments = path.split('/').filter(Boolean);
    const entity = segments[0] ?? 'unknown';
    const entityId = segments[1] ?? null;
    const { sub: userId, organizationId } = req.user;

    return next.handle().pipe(
      tap(() => {
        // El tap corre de forma asíncrona y puede ejecutarse fuera del
        // AsyncLocalStorage del TenantContextInterceptor; reabrimos el contexto
        // del tenant para que el INSERT respete la RLS de AuditLog.
        void tenantStorage.run({ organizationId }, () =>
          this.prisma.auditLog
            .create({ data: { action: req.method, entity, entityId, userId, organizationId } })
            // No tumbamos la respuesta (la mutación ya hizo commit), pero un fallo
            // de auditoría NO debe pasar en silencio: degrada la trazabilidad y hay
            // que detectarlo (SEC-22).
            .catch((err: unknown) =>
              this.logger.error(
                `Fallo al escribir audit log (${req.method} ${entity} ${entityId ?? ''}): ${String(err)}`,
              ),
            ),
        );
      }),
    );
  }
}
