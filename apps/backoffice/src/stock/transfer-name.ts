/**
 * Helpers de nombre para traspasos (S-17).
 *
 * El backend reutiliza el campo `notes` del traspaso como etiqueta/nombre (P100),
 * sin migración. Estos helpers viven aquí (módulo puro y testeable) para derivar
 * el nombre por defecto cuando el usuario no escribe ninguno y para resolver el
 * nombre mostrado en tabla, export y buscador.
 */

/** Límite de caracteres del nombre escrito por el usuario (P106). */
export const TRANSFER_NAME_MAX_LENGTH = 80;

/**
 * Auto-nombre por defecto cuando no se escribe ninguno: `"{Origen} → {Destino}"`.
 *
 * Determinista y sin estado: no depende de contar traspasos existentes, así que
 * no puede colisionar ni repetirse por concurrencia. Si falta el nombre de
 * alguna tienda, cae a "Traspaso" como etiqueta mínima legible.
 */
export function fallbackTransferName(originName?: string, destName?: string): string {
  const origin = (originName ?? '').trim();
  const dest = (destName ?? '').trim();
  if (origin && dest) return `${origin} → ${dest}`;
  if (origin) return origin;
  if (dest) return dest;
  return 'Traspaso';
}

/**
 * Recorta a 80 caracteres con trim en cliente (P106). Aplica `trim()` y corta a
 * la longitud máxima por si el valor llega por una vía que esquiva `maxLength`.
 */
export function normalizeTransferName(raw: string): string {
  return raw.trim().slice(0, TRANSFER_NAME_MAX_LENGTH);
}

/**
 * Nombre mostrado de un traspaso: `notes` si existe (tras trim), o el auto-nombre
 * "Origen → Destino" como fallback (P105). Lo usan la columna, el export CSV y el
 * buscador para mostrar/filtrar siempre por el mismo valor.
 */
export function transferDisplayName(
  notes: string | null | undefined,
  originName?: string,
  destName?: string,
): string {
  const trimmed = (notes ?? '').trim();
  if (trimmed) return trimmed;
  return fallbackTransferName(originName, destName);
}
