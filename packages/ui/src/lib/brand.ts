// U-08: aplicación del color corporativo de la organización como tema en runtime.
// Sobrescribe los tokens de acento (--ui-brand*) y de acción (--ui-primary*) en
// :root derivando tintes y el color de texto por CONTRASTE (AA): sobre marcas
// claras el texto del botón pasa a oscuro. `null` restaura el tema por defecto.

export interface Branding {
  brandColor: string | null;
  logoUrl: string | null;
}

const BRAND_VARS = [
  '--ui-brand',
  '--ui-brand-ink',
  '--ui-brand-soft',
  '--ui-brand-soft-2',
  '--ui-primary',
  '--ui-primary-hover',
  '--ui-primary-fg',
] as const;

// Luminancia relativa WCAG de un color #rrggbb (0 = negro, 1 = blanco).
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1]!.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function applyBrandColor(color: string | null | undefined): void {
  const root = document.documentElement;
  if (!color) {
    for (const v of BRAND_VARS) root.style.removeProperty(v);
    return;
  }
  // Contraste del texto sobre el color (4.5:1): blanco si la marca es oscura.
  const fg = 1.05 / (relativeLuminance(color) + 0.05) >= 4.5 ? '#ffffff' : '#18181a';
  root.style.setProperty('--ui-brand', color);
  root.style.setProperty('--ui-brand-ink', `color-mix(in srgb, ${color} 72%, black)`);
  root.style.setProperty('--ui-brand-soft', `color-mix(in srgb, ${color} 8%, transparent)`);
  root.style.setProperty('--ui-brand-soft-2', `color-mix(in srgb, ${color} 13%, transparent)`);
  root.style.setProperty('--ui-primary', color);
  root.style.setProperty('--ui-primary-hover', `color-mix(in srgb, ${color} 85%, black)`);
  root.style.setProperty('--ui-primary-fg', fg);
}
