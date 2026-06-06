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
  Put,
} from '@nestjs/common';

import { Roles } from '../auth/roles.decorator.js';
import { CreatePriceListDto, SetPriceListItemDto, UpdatePriceListDto } from './b2b.dto.js';
import { PriceListsService } from './price-lists.service.js';

// Tarifas (listas de precios) (IT-17). Función de central → ADMIN/MANAGER.
@Controller('price-lists')
export class PriceListsController {
  constructor(private readonly priceLists: PriceListsService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER')
  list() {
    return this.priceLists.list();
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.priceLists.get(id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: CreatePriceListDto) {
    return this.priceLists.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdatePriceListDto) {
    return this.priceLists.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.priceLists.remove(id);
  }

  // Fija (upsert) el precio de un producto en la tarifa.
  @Put(':id/items')
  @Roles('ADMIN', 'MANAGER')
  setItem(@Param('id', ParseUUIDPipe) id: string, @Body() body: SetPriceListItemDto) {
    return this.priceLists.setItem(id, body);
  }

  @Delete(':id/items/:productId')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(204)
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.priceLists.removeItem(id, productId);
  }
}
