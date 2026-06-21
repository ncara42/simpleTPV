import { useEffect, useRef, useState } from 'react';

// Nombre por defecto del lienzo cuando el usuario no lo ha renombrado.
const DEFAULT_NAME = 'Canvas 1';

interface DashTitleProps {
  /** Nombre persistido del lienzo; vacío → se muestra el valor por defecto. */
  value?: string | undefined;
  /** Confirma el renombrado (cadena vacía = volver al valor por defecto). */
  onCommit: (name: string) => void;
}

// Título del dashboard editable al pulsar encima. En reposo es un botón con
// pinta de texto (accesible por teclado); al activarlo se convierte en un input
// que confirma con Enter/blur y descarta con Escape.
export function DashTitle({ value, onCommit }: DashTitleProps) {
  const display = value?.trim() || DEFAULT_NAME;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(display);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const start = (): void => {
    setDraft(display);
    setEditing(true);
  };

  const commit = (): void => {
    setEditing(false);
    const next = draft.trim();
    // Solo persiste si cambia (evita escrituras/persistencia innecesarias).
    if (next !== display) onCommit(next);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="dash-preset-label dash-preset-label-input"
        value={draft}
        maxLength={60}
        aria-label="Nombre del lienzo"
        data-testid="dash-preset-name-input"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="dash-preset-label dash-preset-label-btn"
      title="Renombrar lienzo"
      data-testid="dash-preset-personalizado"
      onClick={start}
    >
      {display}
    </button>
  );
}
