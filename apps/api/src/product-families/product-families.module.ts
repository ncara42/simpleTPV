import { Module } from '@nestjs/common';

import { ProductFamiliesController } from './product-families.controller.js';
import { ProductFamiliesService } from './product-families.service.js';

@Module({
  controllers: [ProductFamiliesController],
  providers: [ProductFamiliesService],
})
export class ProductFamiliesModule {}
