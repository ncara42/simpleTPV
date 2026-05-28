import { SaleUnit } from '@simpletpv/db';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumber()
  @Min(0)
  salePrice!: number;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsOptional()
  @IsString()
  sku?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsEnum(SaleUnit)
  saleUnit?: SaleUnit;

  @IsOptional()
  @IsString()
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
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsOptional()
  @IsString()
  sku?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @IsOptional()
  @IsEnum(SaleUnit)
  saleUnit?: SaleUnit;

  @IsOptional()
  @IsString()
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
