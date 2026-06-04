import { SaleUnit } from '@simpletpv/db';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

// Cota superior de precios alineada con Decimal(10,4) del esquema (6 dígitos
// enteros). Evita que un valor enorme/con exceso de decimales reviente el INSERT
// con un 500 en vez de un 400 (SEC-15).
const MAX_PRICE = 999999.9999;

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_PRICE)
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
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_PRICE)
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
