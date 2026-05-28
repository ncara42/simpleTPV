import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';

import { Roles } from '../auth/roles.decorator.js';
import {
  type CreateFamilyInput,
  type FamilyNode,
  ProductFamiliesService,
  type UpdateFamilyInput,
} from './product-families.service.js';

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
  create(@Body() body: CreateFamilyInput): Promise<unknown> {
    return this.families.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateFamilyInput): Promise<unknown> {
    return this.families.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.families.remove(id);
  }
}
