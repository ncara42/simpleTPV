import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { MAX_PRICE, MAX_QUANTITY } from '../common/limits.js';

export class CreatePurchaseOrderLineDto {
  @IsUUID()
  productId!: string;

  // Cantidad pedida — Decimal(12,3): hasta 3 decimales y acotada (A-03).
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(MAX_QUANTITY)
  quantityOrdered!: number;

  // Coste unitario — Decimal(10,4).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_PRICE)
  unitCost?: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  supplierId!: string;

  // Tienda/almacén destino donde se recibirá la mercancía.
  @IsUUID()
  storeId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  lines!: CreatePurchaseOrderLineDto[];
}

export class ReceivePurchaseOrderLineDto {
  @IsUUID()
  lineId!: string;

  // Cantidad recibida en esta recepción (>= 0). Se acumula a lo ya recibido. Decimal(12,3).
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(MAX_QUANTITY)
  quantityReceived!: number;

  // Lote y caducidad de lo recibido (#126). Obligatorio el lote para productos con
  // tracksBatch (validado en el servicio); ignorado para el resto. expiryDate opcional.
  @IsOptional()
  @IsString()
  @MinLength(1)
  lotCode?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiryDate debe tener formato YYYY-MM-DD' })
  expiryDate?: string;
}

export class ReceivePurchaseOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderLineDto)
  lines!: ReceivePurchaseOrderLineDto[];
}

// Propuesta de pedido (#45): genera líneas sugeridas para una tienda.
export class SuggestPurchaseOrderDto {
  @IsUUID()
  storeId!: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  // Días de cobertura objetivo para la fórmula de sugerencia (default 14).
  @IsOptional()
  @IsPositive()
  daysCoverage?: number;
}
