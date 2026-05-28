import { IsNumber, IsUUID, Min } from 'class-validator';

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
