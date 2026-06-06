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

import { Roles } from '../auth/roles.decorator.js';
import { CreateCustomerDto, UpdateCustomerDto } from './b2b.dto.js';
import { CustomersService } from './customers.service.js';

// Clientes B2B (IT-17). Función de central → ADMIN/MANAGER.
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER')
  list() {
    return this.customers.list();
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: CreateCustomerDto) {
    return this.customers.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateCustomerDto) {
    return this.customers.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.remove(id);
  }
}
