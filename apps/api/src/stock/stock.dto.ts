import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

// Configuración del stock mínimo de un producto en una tienda (#29).
export class SetMinStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  storeId!: string;

  // El mínimo no puede ser negativo. 0 = sin umbral (solo alerta al agotarse).
  @Min(0)
  minStock!: number;
}

// Ajuste manual de inventario (#30): fija el stock a newQuantity con un motivo.
export class AdjustStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  storeId!: string;

  // Cantidad nueva absoluta tras el recuento. No negativa. El servicio calcula
  // el delta (newQuantity - actual) y lo aplica como movimiento ADJUSTMENT.
  @IsNumber()
  @Min(0)
  newQuantity!: number;

  // Motivo obligatorio del ajuste (recuento, merma, rotura...). Auditoría.
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class InventoryCountLineDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  @Min(0)
  countedQuantity!: number;
}

export class ConfirmInventoryCountDto {
  @IsUUID()
  storeId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventoryCountLineDto)
  lines!: InventoryCountLineDto[];
}
