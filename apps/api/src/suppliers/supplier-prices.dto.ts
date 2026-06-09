import { IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

// Precio máximo: misma cota que Decimal(10,4) del esquema (evita desbordes).
const MAX_PRICE = 999999.9999;

export class UpsertSupplierPriceDto {
  @IsUUID()
  supplierId!: string;

  @IsUUID()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_PRICE)
  price!: number;
}

export class ListSupplierPricesQueryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;
}

export class ComparisonQueryDto {
  // Arquetipo/familia cuyos productos se comparan entre proveedores.
  @IsOptional()
  @IsUUID()
  familyId?: string;
}

export class ImportSupplierPricesDto {
  @IsUUID()
  supplierId!: string;

  // CSV con cabecera `sku,price`: tarifa del proveedor para cada producto por SKU.
  @IsString()
  csv!: string;
}
