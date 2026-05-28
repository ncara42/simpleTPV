import { UserRole } from '@simpletpv/db';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class SetPinDto {
  @Matches(/^\d{4,8}$/, { message: 'El PIN debe tener entre 4 y 8 dígitos' })
  pin!: string;
}

export class AssignStoresDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  storeIds!: string[];
}
