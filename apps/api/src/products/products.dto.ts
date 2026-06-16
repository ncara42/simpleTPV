import { SaleUnit } from '@simpletpv/db';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  MAX_BARCODE_LENGTH,
  MAX_CODE_LENGTH,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_PRICE,
} from '../common/limits.js';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_PRICE)
  salePrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_BARCODE_LENGTH)
  barcode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_BARCODE_LENGTH)
  sku?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_PRICE)
  costPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRate?: number;

  @IsOptional()
  @IsEnum(SaleUnit)
  saleUnit?: SaleUnit;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CODE_LENGTH)
  unitSymbol?: string;

  @IsOptional()
  @IsUUID()
  familyId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_PRICE)
  salePrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_BARCODE_LENGTH)
  barcode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_BARCODE_LENGTH)
  sku?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_PRICE)
  costPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRate?: number;

  @IsOptional()
  @IsEnum(SaleUnit)
  saleUnit?: SaleUnit;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CODE_LENGTH)
  unitSymbol?: string;

  @IsOptional()
  @IsUUID()
  familyId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ImportProductsDto {
  @IsString()
  csv!: string;
}
