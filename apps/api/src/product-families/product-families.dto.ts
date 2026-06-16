import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { MAX_CODE_LENGTH, MAX_NAME_LENGTH } from '../common/limits.js';

export class CreateFamilyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CODE_LENGTH)
  color?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CODE_LENGTH)
  icon?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isArchetype?: boolean;
}

export class UpdateFamilyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME_LENGTH)
  name?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CODE_LENGTH)
  color?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CODE_LENGTH)
  icon?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isArchetype?: boolean;
}
