import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { Roles } from '../auth/roles.decorator.js';
import type { ImportResult } from '../common/csv.js';
import {
  ComparisonQueryDto,
  ImportSupplierPricesDto,
  ListSupplierPricesQueryDto,
  UpsertSupplierPriceDto,
} from './supplier-prices.dto.js';
import {
  type ComparisonRow,
  type SupplierPriceRow,
  SupplierPricesService,
} from './supplier-prices.service.js';

// Tarifas de compra por proveedor (P1-B). Lectura ADMIN/MANAGER; escritura igual.
@Controller('supplier-prices')
export class SupplierPricesController {
  constructor(private readonly prices: SupplierPricesService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER')
  list(@Query() query: ListSupplierPricesQueryDto): Promise<SupplierPriceRow[]> {
    return this.prices.list(query);
  }

  @Get('comparison')
  @Roles('ADMIN', 'MANAGER')
  comparison(@Query() query: ComparisonQueryDto): Promise<ComparisonRow[]> {
    return this.prices.comparison(query.familyId);
  }

  @Put()
  @Roles('ADMIN', 'MANAGER')
  upsert(@Body() body: UpsertSupplierPriceDto): Promise<SupplierPriceRow> {
    return this.prices.upsert(body);
  }

  @Post('import')
  @Roles('ADMIN', 'MANAGER')
  importCsv(@Body() body: ImportSupplierPricesDto): Promise<ImportResult> {
    return this.prices.importCsv(body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.prices.remove(id);
  }
}
