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
