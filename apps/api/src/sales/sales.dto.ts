import { PaymentMethod } from '@simpletpv/db';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsUUID,
  Matches,
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

  // Importe fijo de descuento de la línea (>= 0). Opcional. Si llega también
  // discountPct, el importe tiene precedencia (resuelto en computeTotals, igual
  // que el descuento de ticket). Se capa al bruto de la línea.
  @IsOptional()
  @Min(0)
  discountAmt?: number;
}

export class CreateSaleDto {
  @IsUUID()
  storeId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
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

// Query del listado de ventas (#14). Todos los campos son opcionales: sin
// filtros devuelve todas las ventas del tenant paginadas. Los numéricos llegan
// como string en el querystring, de ahí @Type(() => Number) para transformarlos
// antes de validar @IsInt.
export class ListSalesQueryDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  // Día a filtrar en formato YYYY-MM-DD. El servicio lo convierte al rango UTC.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date debe tener formato YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
