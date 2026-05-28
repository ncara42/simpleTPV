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
import type { ProductFamily } from '@simpletpv/db';

import { Roles } from '../auth/roles.decorator.js';
import { CreateFamilyDto, UpdateFamilyDto } from './product-families.dto.js';
import { type FamilyNode, ProductFamiliesService } from './product-families.service.js';

// AuthGuard global exige sesión. Escritura solo ADMIN (@Roles + RolesGuard global).
@Controller('product-families')
export class ProductFamiliesController {
  constructor(private readonly families: ProductFamiliesService) {}

  @Get()
  findTree(): Promise<FamilyNode[]> {
    return this.families.findTree();
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() body: CreateFamilyDto): Promise<ProductFamily> {
    return this.families.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateFamilyDto,
  ): Promise<ProductFamily> {
    return this.families.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.families.remove(id);
  }
}
