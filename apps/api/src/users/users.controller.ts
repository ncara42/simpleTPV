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
import { Throttle } from '@nestjs/throttler';

import { Roles } from '../auth/roles.decorator.js';
import type { ImportResult } from '../common/csv.js';
import {
  AssignStoresDto,
  CreateUserDto,
  ImportUsersDto,
  SetPinDto,
  UpdateUserDto,
} from './users.dto.js';
import { type PublicUser, UsersService } from './users.service.js';

// Gestión de usuarios: solo ADMIN.
@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(): Promise<Array<PublicUser & { storeIds: string[] }>> {
    return this.users.findAll();
  }

  @Post()
  create(@Body() body: CreateUserDto): Promise<PublicUser> {
    return this.users.create(body);
  }

  // Import en lote: hasta 500 hashes bcrypt por petición (CPU-bound). Límite de
  // ruta más estricto que el global (2/min) para evitar DoS autenticado (DOS-03).
  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @Post('import')
  importCsv(@Body() body: ImportUsersDto): Promise<ImportResult> {
    return this.users.importCsv(body.csv);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateUserDto): Promise<PublicUser> {
    return this.users.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.users.remove(id);
  }

  @Put(':id/pin')
  @HttpCode(204)
  setPin(@Param('id', ParseUUIDPipe) id: string, @Body() body: SetPinDto): Promise<void> {
    return this.users.setPin(id, body.pin);
  }

  @Put(':id/stores')
  @HttpCode(204)
  assignStores(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignStoresDto,
  ): Promise<void> {
    return this.users.assignStores(id, body.storeIds);
  }
}
