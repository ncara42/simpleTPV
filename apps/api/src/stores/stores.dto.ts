import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { MAX_ADDRESS_LENGTH, MAX_CODE_LENGTH, MAX_NAME_LENGTH } from '../common/limits.js';

export class CreateStoreDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;

  // Código de tienda (p.ej. "01"), parte del nº de ticket secuencial.
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CODE_LENGTH)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ADDRESS_LENGTH)
  address?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CODE_LENGTH)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ADDRESS_LENGTH)
  address?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
