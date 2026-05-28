import { PaymentMethod } from '@simpletpv/db';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CreateSaleLineDto {
  @IsUUID()
  productId!: string;

  @IsPositive()
  qty!: number;
}

export class CreateSaleDto {
  @IsUUID()
  storeId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleLineDto)
  lines!: CreateSaleLineDto[];

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  // Solo aplica en efectivo; el servicio valida que cubra el total.
  @IsOptional()
  @IsPositive()
  cashGiven?: number;
}
