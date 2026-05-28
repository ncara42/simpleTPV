import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

import { tenantStorage } from '../prisma/tenant-context.js';
import type { JwtPayload } from './jwt-payload.js';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return next.handle();
    }
    return tenantStorage.run({ organizationId }, () => next.handle());
  }
}
