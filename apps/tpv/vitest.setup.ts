import '@testing-library/jest-dom/vitest';

// jsdom bajo Node 22 no siempre expone window.localStorage (el localStorage
// experimental de Node lo deja sin definir). Producción sí lo usa (persister de
// queries, auth-store, cola offline), así que aquí ponemos un polyfill en memoria
// para que los tests que dependen de localStorage funcionen de forma determinista.
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    value: memoryStorage,
    configurable: true,
  });
}
