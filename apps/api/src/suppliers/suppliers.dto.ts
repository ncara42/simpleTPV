import { IsEmail, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  nif?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
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
  name?: string;

  @IsOptional()
  @IsString()
  nif?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;
}
