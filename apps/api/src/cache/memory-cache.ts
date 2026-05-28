import type { Cache } from './cache.interface.js';

// Implementación de cache en memoria (Map). Para tests unit y como fallback si
// no hay REDIS_URL configurada. No persiste ni se comparte entre procesos.
export class MemoryCache implements Cache {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}
