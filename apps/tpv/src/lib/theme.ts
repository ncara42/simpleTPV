// Tema claro/oscuro del TPV. El tema vive en el atributo `data-theme` de <html>;
// el script de arranque (index.html) lo fija ANTES de pintar según
// localStorage('theme') o `prefers-color-scheme`, evitando el parpadeo. Las
// reglas dark viven en @simpletpv/ui/theme-geist.css (`:root[data-theme='dark']`).
// (Gemelo de apps/backoffice/src/lib/theme.ts — el TPV comparte la fundación Geist.)

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/** Tema activo según el atributo data-theme de <html>. */
export function getTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** Aplica el tema: atributo en <html> + persistencia en localStorage. */
export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage puede fallar (modo privado): el atributo basta para la sesión.
  }
}

/** Alterna claro↔oscuro y devuelve el tema resultante. */
export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
