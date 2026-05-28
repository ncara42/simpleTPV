import { PaymentMethod } from '@simpletpv/db';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSaleLineDto {
  @IsUUID()
  productId!: string;

  @IsPositive()
  qty!: number;

  // % de descuento de la línea (0–100). Opcional; ausente = sin descuento.
  @IsOptional()
  @Min(0)
  @Max(100)
  discountPct?: number;
}

export class CreateSaleDto {
  @IsUUID()
  storeId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleLineDto)
  lines!: CreateSaleLineDto[];

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  // Solo aplica en efectivo; el servicio valida que cubra el total.
  @IsOptional()
  @IsPositive()
  cashGiven?: number;

  // Descuento de ticket por porcentaje (0–100). Si llega también
  // ticketDiscountAmt, el importe tiene precedencia (resuelto en el servicio).
  @IsOptional()
  @Min(0)
  @Max(100)
  ticketDiscountPct?: number;

  // Descuento de ticket por importe fijo (>= 0). Se capa al subtotal.
  @IsOptional()
  @Min(0)
  ticketDiscountAmt?: number;
}
