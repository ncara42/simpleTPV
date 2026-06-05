// Formato de importes en euros con locale es-ES (coma decimal), para que la UI
// coincida con los mockups ("24,90 €", "73,80 €"). Devuelve solo el número
// formateado; el símbolo "€" se añade en el JSX para no acoplar el separador.
const eurFormatter = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function eur(value: number): string {
  return eurFormatter.format(value);
}

// Formatea una duración en milisegundos como HH:MM:SS (contador del fichaje).
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

// Duración en milisegundos como "Xh Ym" (o "Ym" si es menos de una hora), para los
// totales de la tabla de fichajes. Espejo de fmtMinutes del backoffice.
export function fmtHm(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
