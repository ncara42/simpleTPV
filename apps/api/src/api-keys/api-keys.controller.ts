import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { Roles } from '../auth/roles.decorator.js';
import { CreateApiKeyDto } from './api-keys.dto.js';
import { ApiKeysService } from './api-keys.service.js';

// Gestión de API keys (IT-18). Solo ADMIN puede crear/listar/revocar keys.
@Controller('api-keys')
@Roles('ADMIN')
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  generate(@Body() body: CreateApiKeyDto) {
    return this.service.generate(body);
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.revoke(id);
  }
}
