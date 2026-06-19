import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom con origen opaco (about:blank, el default) no expone window.localStorage
// bajo Node 22+/26. Componentes como Sidebar persisten su estado ahí, así que
// proveemos un Storage en memoria si falta (mismo patrón que el mock de matchMedia
// en apps/backoffice). El guard lo deja intacto si el entorno ya lo trae.
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

afterEach(() => {
  cleanup();
});
