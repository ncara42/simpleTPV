import { Download, Upload } from 'lucide-react';

interface CsvActionButtonProps {
  kind: 'export' | 'import';
  onClick: () => void;
  // Texto que aparece en hover y como aria-label (siempre presente para a11y).
  label?: string;
  testId?: string;
  disabled?: boolean;
}

// Botón solo-icono de la banda .table-actions para Exportar/Importar CSV. En reposo
// muestra solo el icono (Download = exportar, Upload = importar); al hacer hover o
// focus se ALARGA y revela el texto junto al icono (animación de max-width/opacidad,
// compositor-friendly, con prefers-reduced-motion respetado en el CSS .csv-action).
// El aria-label va SIEMPRE presente: la animación es decorativa, no la fuente del
// nombre accesible.
export function CsvActionButton({ kind, onClick, label, testId, disabled }: CsvActionButtonProps) {
  const text = label ?? (kind === 'export' ? 'Exportar' : 'Importar');
  const Icon = kind === 'export' ? Download : Upload;
  return (
    <button
      type="button"
      className={`csv-action csv-action--${kind}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={text}
      title={text}
      data-testid={testId}
    >
      <Icon size={18} aria-hidden="true" />
      <span className="csv-action__label">{text}</span>
    </button>
  );
}
