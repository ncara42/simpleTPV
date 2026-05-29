import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// ThrottlerGuard que se DESACTIVA bajo NODE_ENV=test. Los e2e (Playwright) y los
// tests hacen muchos logins/requests seguidos desde la misma IP; el rate limiting
// real los cortaría con 429 y haría fallar el setup. En dev y producción el
// throttling sigue plenamente activo (límite global + @Throttle del login).
@Injectable()
export class TestAwareThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(): Promise<boolean> {
    return process.env.NODE_ENV === 'test';
  }
}
