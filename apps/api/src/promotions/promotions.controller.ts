import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { Promotion } from '@simpletpv/db';

import { Roles } from '../auth/roles.decorator.js';
import { CreatePromotionDto, UpdatePromotionDto } from './promotions.dto.js';
import { PromotionsService } from './promotions.service.js';

// AuthGuard global exige sesión en todas las rutas. La escritura, además, rol ADMIN o
// MANAGER vía @Roles + RolesGuard global. Promociones es catálogo de central (org-wide).
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  findAll(): Promise<Promotion[]> {
    return this.promotions.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Promotion> {
    return this.promotions.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: CreatePromotionDto): Promise<Promotion> {
    return this.promotions.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePromotionDto,
  ): Promise<Promotion> {
    return this.promotions.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.promotions.remove(id);
  }
}
