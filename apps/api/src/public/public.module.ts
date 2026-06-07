import { Module } from '@nestjs/common';

import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { PublicController } from './public.controller.js';

@Module({
  imports: [ApiKeysModule],
  controllers: [PublicController],
})
export class PublicModule {}
