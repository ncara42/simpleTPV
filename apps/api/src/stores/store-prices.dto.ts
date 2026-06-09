import { IsNumber, IsString, IsUUID, Max, Min } from 'class-validator';

import { MAX_PRICE } from '../common/limits.js';

// Override de precio retail de un producto en una tienda (#127 A). price es un PVP
// ABSOLUTO (no porcentaje), con la misma escala Decimal(10,4) que el catálogo y las
// tarifas B2B: @IsNumber({ maxDecimalPlaces: 4 }) + @Min(0) + @Max(MAX_PRICE) evitan
// que un valor enorme o con exceso de decimales reviente el INSERT o lo redondee
// Postgres en silencio (A-03 / SEC-15).
export class SetStorePriceDto {
  @IsUUID()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_PRICE)
  price!: number;
}

// Importación en lote de precios por tienda (CSV con cabecera `sku,price`).
export class ImportStorePricesDto {
  @IsString()
  csv!: string;
}
