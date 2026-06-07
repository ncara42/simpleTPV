import { PaymentMethod, SaleStatus } from '@simpletpv/db';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { MAX_AMOUNT, MAX_QUANTITY } from '../common/limits.js';

export class CreateSaleLineDto {
  @IsUUID()
  productId!: string;

  // Cantidad — Decimal(10,3): hasta 3 decimales y acotada (A-03).
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(MAX_QUANTITY)
  qty!: number;

  // % de descuento de la línea (0–100). Opcional; ausente = sin descuento.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPct?: number;

  // Importe fijo de descuento de la línea (>= 0). Opcional. Si llega también
  // discountPct, el importe tiene precedencia (resuelto en computeTotals, igual
  // que el descuento de ticket). Se capa al bruto de la línea.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
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

  // Solo aplica en efectivo; el servicio valida que cubra el total. Importe Decimal(12,2).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_AMOUNT)
  cashGiven?: number;

  // Descuento de ticket por porcentaje (0–100). Si llega también
  // ticketDiscountAmt, el importe tiene precedencia (resuelto en el servicio).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  ticketDiscountPct?: number;

  // Descuento de ticket por importe fijo (>= 0). Se capa al subtotal. Decimal(12,2).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
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
  // Atajo de un solo día; `from`/`to` tienen prioridad si llegan.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date debe tener formato YYYY-MM-DD' })
  date?: string;

  // Rango de fechas [from, to] (ambos inclusive, YYYY-MM-DD). Cualquiera de los
  // dos puede ir solo (rango abierto por un extremo). El servicio los pasa a UTC.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from debe tener formato YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to debe tener formato YYYY-MM-DD' })
  to?: string;

  // Filtra por vendedor (User.id de quien registró la venta).
  @IsOptional()
  @IsUUID()
  userId?: string;

  // Filtra por familia de producto: ventas con al menos una línea cuyo producto
  // pertenece a esta familia.
  @IsOptional()
  @IsUUID()
  familyId?: string;

  // Filtra por estado de la venta (COMPLETED/VOIDED). Afecta solo al listado; los
  // agregados de importe/margen/descuento se calculan siempre sobre COMPLETED.
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

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
