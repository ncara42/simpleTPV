import { Body, Controller, Get, Patch } from '@nestjs/common';

import { Roles } from '../auth/roles.decorator.js';
import { UpdateBrandingDto } from './branding.dto.js';
import { type Branding, BrandingService } from './branding.service.js';

// U-08: marca corporativa de la organización. La lectura es para cualquier
// autenticado (backoffice Y TPV aplican el tema al arrancar); la escritura es
// función de central → solo ADMIN.
@Controller('organization/branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get()
  get(): Promise<Branding> {
    return this.branding.get();
  }

  @Patch()
  @Roles('ADMIN')
  update(@Body() dto: UpdateBrandingDto): Promise<Branding> {
    return this.branding.update(dto);
  }
}
