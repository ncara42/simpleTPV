import { Module } from '@nestjs/common';

import { ApiKeyGuard } from './api-key.guard.js';
import { ApiKeyLookupService } from './api-key-lookup.service.js';
import { ApiKeysController } from './api-keys.controller.js';
import { ApiKeysService } from './api-keys.service.js';

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeyLookupService, ApiKeyGuard, ApiKeysService],
  exports: [ApiKeyLookupService, ApiKeyGuard],
})
export class ApiKeysModule {}
