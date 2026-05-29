import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CreateReturnLineDto {
  @IsUUID()
  saleLineId!: string;

  // Cantidad a devolver de esta línea (> 0). El servicio valida además que no
  // exceda lo disponible (vendido − ya devuelto).
  @IsPositive()
  qty!: number;
}

export class CreateReturnDto {
  @IsUUID()
  saleId!: string;

  // Motivo obligatorio (auditoría). @IsNotEmpty rechaza la cadena vacía.
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateReturnLineDto)
  lines!: CreateReturnLineDto[];
}

// Línea de una devolución SIN ticket (#59): producto + cantidad. El importe lo
// calcula el servidor desde el precio actual del catálogo.
export class BlindReturnLineDto {
  @IsUUID()
  productId!: string;

  @IsPositive()
  qty!: number;
}

// Devolución sin ticket (#59): requiere motivo y el PIN de un MANAGER/ADMIN que
// autoriza la operación (el operario puede ser CLERK).
export class CreateBlindReturnDto {
  @IsUUID()
  storeId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  // PIN (4-8 dígitos) de un MANAGER/ADMIN del tenant que autoriza la devolución.
  @IsString()
  @IsNotEmpty()
  managerPin!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BlindReturnLineDto)
  lines!: BlindReturnLineDto[];
}
