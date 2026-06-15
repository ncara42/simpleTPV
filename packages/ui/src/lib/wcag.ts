// Validación de legibilidad del color de marca según WCAG 2.x. Reutiliza la
// luminancia relativa ya definida en brand.ts (no duplicar la fórmula) y evalúa
// los pares de contraste reales con los que el primary aparece en las páginas:
//  - texto del botón primario sobre el propio color (acción),
//  - el color como texto/acento sobre la superficie blanca,
//  - el color como componente UI sobre el fondo de la app.

import { relativeLuminance } from './brand.js';

// Candidatos de texto del botón: mismo criterio que applyBrandColor en brand.ts.
const INK_LIGHT = '#ffffff';
const INK_DARK = '#18181a';

// Umbrales WCAG 2.x.
const AAA = 7;
const AA = 4.5;
const AA_LARGE = 3;

/** Superficies reales del tema sobre las que se proyecta el color de marca. */
export interface BrandSurfaces {
  /** Superficie de tarjetas/paneles (token --ui-surface). */
  surface: string;
  /** Fondo de la aplicación (token --ui-bg). */
  bg: string;
}

// Defaults derivados de theme.css; el caller puede pasar los tokens reales.
const DEFAULT_SURFACES: BrandSurfaces = { surface: '#ffffff', bg: '#f6f6f4' };

/** Ratio de contraste WCAG 2.x entre dos colores hex (#rrggbb). Rango 1..21. */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export type WcagLevel = 'AAA' | 'AA' | 'AA-large' | 'fail';

/** Clasifica el ratio: AAA (≥7), AA texto (≥4.5), AA grande/UI (≥3) o fail. */
export function wcagLevel(ratio: number): WcagLevel {
  if (ratio >= AAA) return 'AAA';
  if (ratio >= AA) return 'AA';
  if (ratio >= AA_LARGE) return 'AA-large';
  return 'fail';
}

export interface BrandContrastReport {
  /** Texto del botón primario sobre el color (mejor de blanco/oscuro). */
  buttonText: { ratio: number; level: WcagLevel; fg: string };
  /** El color como texto/acento sobre la superficie blanca. */
  onSurface: { ratio: number; level: WcagLevel };
  /** El color como componente UI sobre el fondo de la app. */
  onBackground: { ratio: number; level: WcagLevel };
  /** ¿Es razonable usarlo como color de marca? (botón legible y acento al menos AA-large) */
  ok: boolean;
}

/**
 * Evalúa la legibilidad del color de marca contra las superficies reales del
 * tema. Por defecto usa los valores de theme.css; el caller debería pasar los
 * tokens vigentes (ver SettingsPage) para que el aviso refleje el tema actual.
 */
export function evaluateBrandColor(
  primary: string,
  surfaces: BrandSurfaces = DEFAULT_SURFACES,
): BrandContrastReport {
  // Texto del botón: elige el que más contraste da sobre el color de marca.
  const lightRatio = contrastRatio(INK_LIGHT, primary);
  const darkRatio = contrastRatio(INK_DARK, primary);
  const buttonRatio = Math.max(lightRatio, darkRatio);
  const buttonFg = lightRatio >= darkRatio ? INK_LIGHT : INK_DARK;

  const surfaceRatio = contrastRatio(primary, surfaces.surface);
  const backgroundRatio = contrastRatio(primary, surfaces.bg);

  const buttonText = { ratio: buttonRatio, level: wcagLevel(buttonRatio), fg: buttonFg };
  const onSurface = { ratio: surfaceRatio, level: wcagLevel(surfaceRatio) };
  const onBackground = { ratio: backgroundRatio, level: wcagLevel(backgroundRatio) };

  // El botón debe ser legible y, como acento de texto, alcanzar al menos AA-large.
  const ok = buttonText.level !== 'fail' && onSurface.level !== 'fail';

  return { buttonText, onSurface, onBackground, ok };
}
