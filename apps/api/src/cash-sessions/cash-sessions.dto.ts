import { CashMovementType } from '@simpletpv/db';
import { IsEnum, IsNumber, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class OpenCashSessionDto {
  @IsUUID()
  storeId!: string;

  // Efectivo inicial del cajón al abrir el turno (>= 0).
  @IsNumber()
  @Min(0)
  openingAmount!: number;
}

export class CloseCashSessionDto {
  // Efectivo contado físicamente en el cajón al cerrar el turno (>= 0).
  @IsNumber()
  @Min(0)
  countedAmount!: number;
}

export class CreateCashMovementDto {
  @IsEnum(CashMovementType)
  type!: CashMovementType;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(2)
  reason!: string;
}
