import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateTransferLineDto {
  @IsUUID()
  productId!: string;

  // Cantidad a enviar de esta línea (> 0).
  @IsPositive()
  quantitySent!: number;
}

export class CreateTransferDto {
  @IsUUID()
  originStoreId!: string;

  @IsUUID()
  destStoreId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateTransferLineDto)
  lines!: CreateTransferLineDto[];
}

export class ReceiveTransferLineDto {
  // Línea del traspaso (TransferLine) que se recibe.
  @IsUUID()
  lineId!: string;

  // Cantidad realmente recibida (>= 0; puede ser menor que lo enviado por merma).
  @Min(0)
  quantityReceived!: number;

  @IsOptional()
  @IsString()
  discrepancyNote?: string;
}

export class ReceiveTransferDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReceiveTransferLineDto)
  lines!: ReceiveTransferLineDto[];
}
