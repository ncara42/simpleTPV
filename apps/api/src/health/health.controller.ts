import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/public.decorator.js';

@Controller('health')
export class HealthController {
  // Público: lo consultan los healthchecks de Docker/Dokploy sin token.
  @Public()
  @Get()
  check(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: process.uptime() };
  }
}
