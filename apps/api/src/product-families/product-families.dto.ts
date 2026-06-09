import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateFamilyDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  color?: string | null;

  @IsOptional()
  @IsString()
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
  name?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  color?: string | null;

  @IsOptional()
  @IsString()
  icon?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isArchetype?: boolean;
}
