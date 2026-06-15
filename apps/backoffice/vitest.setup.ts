import '@testing-library/jest-dom/vitest';

import { vi } from 'vitest';

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
