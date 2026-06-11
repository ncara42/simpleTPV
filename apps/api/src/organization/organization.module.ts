import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { BrandingController } from './branding.controller.js';
import { BrandingService } from './branding.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [BrandingController],
  providers: [BrandingService],
})
export class OrganizationModule {}
