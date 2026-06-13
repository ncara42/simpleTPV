import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { Tab } from '../lib/nav.js';
import { CommandPalette } from './CommandPalette.js';

// Atajo mostrado en el lanzador: ⌘K en Mac, Ctrl K en el resto.
const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
const SHORTCUT_HINT = isMac ? '⌘K' : 'Ctrl K';

// U-06: lanzador compacto de la búsqueda de funciones en el header. NO escribe
// aquí: es un botón (con la pista de atajo dentro) que abre el palette central
// —ahí se escribe y se ven las sugerencias—. Atajo global Ctrl/Cmd+K.
export function FunctionSearch({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        className="topbar-search-launcher"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Buscar funciones"
        data-testid="function-search-launcher"
      >
        <Search size={15} aria-hidden="true" className="topbar-search-launcher-icon" />
        <span className="topbar-search-launcher-text">Buscar…</span>
        <kbd className="topbar-search-launcher-kbd">{SHORTCUT_HINT}</kbd>
      </button>
      {/* onNavigate solo navega; el cierre (con su animación de salida) lo gestiona
          el propio palette y termina en onClose → desmontar. */}
      {open && <CommandPalette onNavigate={onNavigate} onClose={() => setOpen(false)} />}
    </>
  );
}
