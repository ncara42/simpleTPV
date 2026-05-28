import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { Product } from '@simpletpv/db';

import { Roles } from '../auth/roles.decorator.js';
import {
  type CreateProductInput,
  type ImportResult,
  ProductsService,
  type UpdateProductInput,
} from './products.service.js';

// AuthGuard global exige sesión en todas las rutas (salvo @Public).
// La escritura, además, rol ADMIN o MANAGER vía @Roles + RolesGuard global.
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('familyId') familyId?: string,
  ): Promise<Product[]> {
    return this.products.findAll(search, familyId);
  }

  // Debe declararse ANTES de @Get(':id') para que "barcode" no se tome como :id.
  @Get('barcode/:code')
  findByBarcode(@Param('code') code: string): Promise<Product> {
    return this.products.findByBarcode(code);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Product> {
    return this.products.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: CreateProductInput): Promise<Product> {
    return this.products.create(body);
  }

  @Post('import')
  @Roles('ADMIN', 'MANAGER')
  importCsv(@Body() body: { csv: string }): Promise<ImportResult> {
    return this.products.importCsv(body.csv ?? '');
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(@Param('id') id: string, @Body() body: UpdateProductInput): Promise<Product> {
    return this.products.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.products.remove(id);
  }
}
