import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// DTOs validados de los endpoints públicos de auth. Son CLASES (no interfaces)
// para que la ValidationPipe global valide y recorte la entrada: es la única
// superficie no autenticada de la API (SEC-12). Sin esto, email/password/
// refreshToken podían llegar con cualquier tipo y propiedades extra.

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken!: string;
}
