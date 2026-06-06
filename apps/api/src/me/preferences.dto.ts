import { IsDefined } from 'class-validator';

export class SetPreferenceDto {
  // Valor JSON arbitrario de la preferencia del usuario (objeto, array o primitivo).
  // No se valida su contenido (es del propio usuario); el servicio acota el tamaño.
  @IsDefined()
  value!: unknown;
}
