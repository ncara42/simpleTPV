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
  MaxLength,
  MinLength,
} from 'class-validator';

// bcryptjs descarta en silencio los bytes 73+ antes de hashear, así que dos
// contraseñas que compartan los primeros 72 bytes producirían el mismo hash
// (CWE-916). Topamos la longitud para rechazar de forma explícita ese caso en
// lugar de truncar sin avisar. Ver issue #107.
export const PASSWORD_MAX_LENGTH = 72;

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(PASSWORD_MAX_LENGTH)
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
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;
}

export class ImportUsersDto {
  @IsString()
  csv!: string;
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
