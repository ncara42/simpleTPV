import { CashMovementType } from '@simpletpv/db';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

import { MAX_AMOUNT } from '../common/limits.js';

export class OpenCashSessionDto {
  @IsUUID()
  storeId!: string;

  // Efectivo inicial del cajón al abrir el turno (>= 0) — Decimal(12,2) (A-03).
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  openingAmount!: number;
}

export class CloseCashSessionDto {
  // Efectivo contado físicamente en el cajón al cerrar el turno (>= 0) — Decimal(12,2).
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  countedAmount!: number;
}

// Listado de cierres de caja de una tienda (registro de arqueos). storeId
// obligatorio (acotado por tienda, SEC-01); limit opcional (1..100, por defecto 30).
export class ListClosedCashSessionsDto {
  @IsUUID()
  storeId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateCashMovementDto {
  @IsEnum(CashMovementType)
  type!: CashMovementType;

  // Importe del movimiento (> 0) — Decimal(12,2).
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(MAX_AMOUNT)
  amount!: number;

  @IsString()
  @MinLength(2)
  reason!: string;
}
