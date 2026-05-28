// Abstracción mínima de cache key→value (string). Las implementaciones NUNCA
// deben lanzar: ante un fallo del backend (Redis caído, timeout...), get devuelve
// null y set/del son no-op, de modo que el llamante degrada a Postgres sin romper.
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

export const CACHE = Symbol('CACHE');
