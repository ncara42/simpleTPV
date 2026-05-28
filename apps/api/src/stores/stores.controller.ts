import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type { Store } from '@simpletpv/db';

import { Roles } from '../auth/roles.decorator.js';
import { type CreateStoreInput, StoresService, type UpdateStoreInput } from './stores.service.js';

@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  findAll(): Promise<Store[]> {
    return this.stores.findAll();
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() body: CreateStoreInput): Promise<Store> {
    return this.stores.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateStoreInput): Promise<Store> {
    return this.stores.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.stores.remove(id);
  }
}
