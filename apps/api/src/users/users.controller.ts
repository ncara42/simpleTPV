import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';

import { Roles } from '../auth/roles.decorator.js';
import { type CreateUserInput, type UpdateUserInput, UsersService } from './users.service.js';

interface PinDto {
  pin: string;
}
interface AssignStoresDto {
  storeIds: string[];
}

// Gestión de usuarios: solo ADMIN.
@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(): Promise<unknown[]> {
    return this.users.findAll();
  }

  @Post()
  create(@Body() body: CreateUserInput): Promise<unknown> {
    return this.users.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUserInput): Promise<unknown> {
    return this.users.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.users.remove(id);
  }

  @Put(':id/pin')
  @HttpCode(204)
  setPin(@Param('id') id: string, @Body() body: PinDto): Promise<void> {
    return this.users.setPin(id, body.pin);
  }

  @Put(':id/stores')
  @HttpCode(204)
  assignStores(@Param('id') id: string, @Body() body: AssignStoresDto): Promise<void> {
    return this.users.assignStores(id, body.storeIds);
  }
}
