import type { BrandSurfaces } from '@simpletpv/ui';

// Lee en runtime los tokens reales del tema vigente para que el aviso de
// contraste refleje los colores que de verdad usan las páginas, no constantes
// duplicadas. Solo --ui-surface y --ui-bg, que en theme.css son hex planos
// (#rrggbb). Si un token no resuelve a hex, cae al default de theme.css.

// Defaults de theme.css (fallback si getComputedStyle no devuelve hex).
const FALLBACK: BrandSurfaces = { surface: '#ffffff', bg: '#f6f6f4' };

const HEX = /^#[0-9a-f]{6}$/i;

// Normaliza un valor de variable CSS a #rrggbb o null si no es hex plano.
function toHex(value: string): string | null {
  const trimmed = value.trim();
  if (HEX.test(trimmed)) return trimmed.toLowerCase();
  // #rgb → #rrggbb
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
  if (short) {
    const [, r, g, b] = short;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

/**
 * Devuelve las superficies reales (--ui-surface, --ui-bg) leídas del
 * documento. Fuera del navegador o si los tokens no son hex planos, usa los
 * defaults de theme.css.
 */
export function readThemeSurfaces(): BrandSurfaces {
  if (typeof document === 'undefined') return FALLBACK;
  const styles = getComputedStyle(document.documentElement);
  const surface = toHex(styles.getPropertyValue('--ui-surface'));
  const bg = toHex(styles.getPropertyValue('--ui-bg'));
  return {
    surface: surface ?? FALLBACK.surface,
    bg: bg ?? FALLBACK.bg,
  };
}
