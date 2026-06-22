import '@testing-library/jest-dom/vitest';

import { vi } from 'vitest';

// jsdom con origen opaco (about:blank, el default) no expone window.localStorage bajo Node 22+/26.
// Componentes (FamiliesPage, SalesHistoryPage, useChat) y tests (GlobalStockSection) lo usan, así que
// proveemos un Storage en memoria si falta (mismo patrón que packages/ui/vitest.setup.ts). El guard lo
// deja intacto si el entorno ya lo trae.
if (!('localStorage' in globalThis) || globalThis.localStorage == null) {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryStorage,
  });
}

// jsdom no implementa matchMedia; lo mockeamos (lo usan componentes como FamiliesPage).
// Devuelve matches:false con los listeners que esperan los consumidores.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
