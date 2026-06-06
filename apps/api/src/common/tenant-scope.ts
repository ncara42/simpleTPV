import { BadRequestException, NotFoundException } from '@nestjs/common';

// Resuelve una consulta tenant-scoped (típicamente un findFirst con organizationId
// en el where) y devuelve el registro, o lanza si no existe. Centraliza el patrón
// repetido en los servicios: `const x = await ...; if (!x) throw ...`.
//
// Dos variantes según la semántica HTTP:
//  - requireOwned → 400: valida una referencia recibida en el body (una FK que
//    debe pertenecer al propio tenant; la FK de Postgres solo comprueba que el id
//    exista, no que sea de la organización).
//  - requireFound → 404: el recurso pedido por la ruta no existe en el tenant.

export async function requireOwned<T>(query: Promise<T | null>, message: string): Promise<T> {
  const row = await query;
  if (!row) throw new BadRequestException(message);
  return row;
}

export async function requireFound<T>(query: Promise<T | null>, message: string): Promise<T> {
  const row = await query;
  if (!row) throw new NotFoundException(message);
  return row;
}
