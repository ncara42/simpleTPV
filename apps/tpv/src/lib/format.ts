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
