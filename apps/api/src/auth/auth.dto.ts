import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// DTO validado del login (clase, no interfaz) para que la ValidationPipe global
// valide y recorte la única superficie no autenticada con body (SEC-12). El
// refresh ya no lleva body: el token viaja en una cookie httpOnly (SEC-20).
export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // bcryptjs trunca a 72 bytes; topamos aquí para no aceptar como válidas
  // contraseñas que el hash habría recortado en silencio (issue #107).
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
