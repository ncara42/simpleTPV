import { CashMovementType } from '@simpletpv/db';
import { IsEnum, IsNumber, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

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
