import { IsEmail, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

import { MAX_NAME_LENGTH, MAX_NIF_LENGTH, MAX_PHONE_LENGTH } from '../common/limits.js';

export class CreateSupplierDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NIF_LENGTH)
  nif?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_PHONE_LENGTH)
  phone?: string;

  // Plazo de entrega estimado en días (>= 0). Base de los KPIs y la propuesta.
  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NIF_LENGTH)
  nif?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_PHONE_LENGTH)
  phone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;
}
