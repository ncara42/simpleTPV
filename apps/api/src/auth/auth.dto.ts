import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// DTO validado del login (clase, no interfaz) para que la ValidationPipe global
// valide y recorte la única superficie no autenticada con body (SEC-12). El
// refresh ya no lleva body: el token viaja en una cookie httpOnly (SEC-20).
export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
