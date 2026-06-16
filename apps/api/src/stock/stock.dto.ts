import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { MAX_NOTES_LENGTH, MAX_QUANTITY } from '../common/limits.js';

// Configuración del stock mínimo de un producto en una tienda (#29).
export class SetMinStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  storeId!: string;

  // El mínimo no puede ser negativo. 0 = sin umbral (solo alerta al agotarse). Decimal(12,3).
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(MAX_QUANTITY)
  minStock!: number;
}

// Ajuste manual de inventario (#30): fija el stock a newQuantity con un motivo.
export class AdjustStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  storeId!: string;

  // Cantidad nueva absoluta tras el recuento. No negativa. El servicio calcula
  // el delta (newQuantity - actual) y lo aplica como movimiento ADJUSTMENT. Decimal(12,3).
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(MAX_QUANTITY)
  newQuantity!: number;

  // Motivo obligatorio del ajuste (recuento, merma, rotura...). Auditoría.
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NOTES_LENGTH)
  reason!: string;
}

export class InventoryCountLineDto {
  @IsUUID()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(MAX_QUANTITY)
  countedQuantity!: number;
}

export class ConfirmInventoryCountDto {
  @IsUUID()
  storeId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_NOTES_LENGTH)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => InventoryCountLineDto)
  lines!: InventoryCountLineDto[];
}
