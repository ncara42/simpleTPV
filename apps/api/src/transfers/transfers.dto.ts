import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { MAX_NOTES_LENGTH, MAX_QUANTITY } from '../common/limits.js';

export class CreateTransferLineDto {
  @IsUUID()
  productId!: string;

  // Cantidad a enviar de esta línea (> 0) — Decimal(12,3): 3 decimales y acotada (A-03).
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(MAX_QUANTITY)
  quantitySent!: number;
}

export class CreateTransferDto {
  @IsUUID()
  originStoreId!: string;

  @IsUUID()
  destStoreId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
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

  // Cantidad realmente recibida (>= 0; puede ser menor que lo enviado por merma). Decimal(12,3).
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(MAX_QUANTITY)
  quantityReceived!: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
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
