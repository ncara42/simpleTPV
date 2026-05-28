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
import type { Store } from '@simpletpv/db';

import { Roles } from '../auth/roles.decorator.js';
import { CreateStoreDto, UpdateStoreDto } from './stores.dto.js';
import { StoresService } from './stores.service.js';

// Gestión de tiendas: solo ADMIN (incluida la lectura, igual que UsersController).
@Controller('stores')
@Roles('ADMIN')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  findAll(): Promise<Store[]> {
    return this.stores.findAll();
  }

  @Post()
  create(@Body() body: CreateStoreDto): Promise<Store> {
    return this.stores.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateStoreDto): Promise<Store> {
    return this.stores.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.stores.remove(id);
  }
}
