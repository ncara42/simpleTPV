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
import type { Supplier } from '@simpletpv/db';

import { Roles } from '../auth/roles.decorator.js';
import { CreateSupplierDto, UpdateSupplierDto } from './suppliers.dto.js';
import { SuppliersService } from './suppliers.service.js';

// Proveedores (#44). Lectura cualquier rol; escritura ADMIN/MANAGER. RLS por tenant.
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  findAll(): Promise<Supplier[]> {
    return this.suppliers.findAll();
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'CLERK')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Supplier> {
    return this.suppliers.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: CreateSupplierDto): Promise<Supplier> {
    return this.suppliers.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSupplierDto,
  ): Promise<Supplier> {
    return this.suppliers.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.suppliers.remove(id);
  }
}
