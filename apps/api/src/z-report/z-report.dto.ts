import { IsUUID, Matches } from 'class-validator';

// Query del cierre Z: tienda y día, ambos obligatorios (informe por tienda y día).
export class ZReportQueryDto {
  @IsUUID()
  storeId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date debe tener formato YYYY-MM-DD' })
  date!: string;
}
