import { ApiError } from '@simpletpv/auth';

// Mensaje de error de formulario con la CAUSA real de la API (D-14, E-14).
// `ApiError.body` ya trae el mensaje legible de NestJS (los arrays de
// class-validator llegan unidos por comas desde api-client). Si el error no es
// de la API o no trae cuerpo útil, se usa el fallback genérico del formulario.
export function formErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.body) {
    return error.body;
  }
  return fallback;
}
