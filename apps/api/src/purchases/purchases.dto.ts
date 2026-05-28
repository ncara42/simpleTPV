import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseOrderLineDto {
  @IsUUID()
  productId!: string;

  @IsPositive()
  quantityOrdered!: number;

  @IsOptional()
  @Min(0)
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
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  lines!: CreatePurchaseOrderLineDto[];
}

export class ReceivePurchaseOrderLineDto {
  @IsUUID()
  lineId!: string;

  // Cantidad recibida en esta recepción (>= 0). Se acumula a lo ya recibido.
  @Min(0)
  quantityReceived!: number;
}

export class ReceivePurchaseOrderDto {
  @IsArray()
  @ArrayMinSize(1)
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
