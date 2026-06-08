// Catálogo de feature flags (#127 B). Cada key declara su default EN CÓDIGO = su
// comportamiento ACTUAL. Los 4 módulos del primer corte están hoy disponibles para
// todos → default `true`; un flag solo sirve para APAGARLOS (un `enabled=false`
// explícito de org o tienda). Un flag ausente NUNCA desactiva nada: la resolución
// cae a este default. Para añadir una key nueva, su default debe ser su conducta
// segura/actual (jamás "apagado" por omisión).
export const FEATURE_FLAGS = {
  blind_returns: { default: true, label: 'Devolución ciega' },
  time_clock: { default: true, label: 'Control horario' },
  data_export: { default: true, label: 'Exportación (ventas y contable)' },
  b2b: { default: true, label: 'Mayorista B2B' },
} as const;

export type FeatureKey = keyof typeof FEATURE_FLAGS;

export const FEATURE_KEYS = Object.keys(FEATURE_FLAGS) as FeatureKey[];
