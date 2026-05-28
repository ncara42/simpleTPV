import { IsUUID, Min } from 'class-validator';

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
