import { Input } from '@simpletpv/ui';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import type { Tab } from '../lib/nav.js';
import { tabToPath } from '../lib/navigation.js';
import { type SearchEntry, searchFunctions } from '../lib/searchIndex.js';
import { Modal } from './Modal.js';

// U-06: palette central de búsqueda de funciones. Se abre desde el lanzador del
// header (o Ctrl/Cmd+K) y es DONDE se escribe y se ven las sugerencias. Reutiliza
// el Modal del backoffice (backdrop, Escape, focus-trap, foco inicial en el campo)
// y la piel ui-menu para los resultados. NAVEGA al elegir; no busca datos.
export function CommandPalette({
  onNavigate,
  onClose,
}: {
  onNavigate: (tab: Tab) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  // S-21: el palette vive DENTRO del Router, así que puede navegar a un deep-link de
  // subsección (`/b2b?section=pricelists`). Las entradas SIN `params` siguen usando
  // `onNavigate(tab)` (sin tocar su firma); solo las que traen `params` enriquecen el destino.
  const navigate = useNavigate();
  // `closing` dispara la animación de salida antes de desmontar (el padre quita el
  // palette al resolver onClose). Sin esto, React desmontaría al instante y no se
  // vería el fundido de cierre.
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const results = useMemo(() => searchFunctions(query), [query]);

  // Agrupa por sección (orden de aparición = relevancia) y asigna a cada item un
  // índice VISUAL correlativo, para que el cursor del teclado recorra la lista en
  // el mismo orden en que se ve y no salte entre grupos.
  const groups = useMemo(() => {
    const map = new Map<string, SearchEntry[]>();
    for (const entry of results) {
      const bucket = map.get(entry.group) ?? [];
      bucket.push(entry);
      map.set(entry.group, bucket);
    }
    let visual = 0;
    return [...map.entries()].map(([group, entries]) => ({
      group,
      items: entries.map((entry) => ({ entry, index: visual++ })),
    }));
  }, [results]);

  // Lista plana en orden visual: el cursor y Enter operan sobre ella.
  const flat = useMemo(() => groups.flatMap((g) => g.items.map((it) => it.entry)), [groups]);

  // Cada cambio de query reinicia el cursor al primer resultado.
  useEffect(() => setCursor(0), [query]);

  // Limpia el temporizador de cierre si se desmonta a mitad de la animación.
  useEffect(() => () => clearTimeout(closeTimer.current ?? undefined), []);

  // Cierre con salida animada: marca `closing`, deja correr la animación (≈140ms)
  // y entonces pide al padre que desmonte. Idempotente.
  const CLOSE_MS = 140;
  const requestClose = (): void => {
    if (closeTimer.current) return;
    setClosing(true);
    closeTimer.current = setTimeout(onClose, CLOSE_MS);
  };

  // Navega al destino de una entrada: deep-link enriquecido (`tabToPath + ?params`)
  // cuando la entrada trae `params` (S-21, p. ej. la subsección Tarifas B2B); en otro
  // caso, la navegación clásica por Tab (`onNavigate`) intacta para el resto del índice.
  const go = (entry: SearchEntry): void => {
    if (entry.params) {
      const qs = new URLSearchParams(entry.params).toString();
      navigate(`${tabToPath(entry.tab)}?${qs}`);
    } else {
      onNavigate(entry.tab);
    }
    requestClose();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (flat.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setCursor((c) => (c + dir + flat.length) % flat.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const hit = flat[cursor] ?? flat[0];
      if (hit) go(hit);
    }
  };

  const trimmed = query.trim();

  // Portal a document.body: el palette se monta dentro del slot `search` del
  // TopBar, y `.topbar` tiene `backdrop-filter`, lo que convierte al header en el
  // bloque contenedor de los elementos `position: fixed`. Sin el portal, el
  // backdrop del Modal se confina a la caja del header (atenúa solo la cabecera y
  // descoloca el panel). El portal lo saca al body y recupera el viewport completo.
  return createPortal(
    <Modal
      onClose={requestClose}
      className={`command-palette${closing ? ' is-closing' : ''}`}
      ariaLabel="Buscar funciones"
      testId="function-search"
    >
      <div className="cmdk-field">
        <Search size={18} aria-hidden="true" className="cmdk-icon" />
        <Input
          type="text"
          className="cmdk-input"
          autoComplete="off"
          spellCheck={false}
          placeholder="Buscar funciones, acciones y ajustes…"
          value={query}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="function-search-results"
          aria-autocomplete="list"
          aria-label="Buscar funciones"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          data-testid="function-search-input"
        />
        <kbd className="cmdk-kbd">Esc</kbd>
      </div>

      <div
        className="cmdk-results"
        id="function-search-results"
        role="listbox"
        data-testid="function-search-results"
      >
        {trimmed === '' && (
          <p className="cmdk-message">Escribe para buscar entre páginas, acciones y ajustes.</p>
        )}
        {trimmed !== '' && results.length === 0 && (
          <p className="cmdk-message">Sin resultados para “{query}”.</p>
        )}
        {groups.map(({ group, items }) => (
          <div key={group} className="cmdk-group">
            <p className="cmdk-group-label">{group}</p>
            <ul className="cmdk-list">
              {items.map(({ entry, index }) => (
                <li key={`${entry.tab}-${entry.label}`} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === cursor}
                    className={`cmdk-item${index === cursor ? ' is-active' : ''}`}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => go(entry)}
                    data-testid={`function-search-result-${entry.tab}`}
                  >
                    <span className="cmdk-item-label">{entry.label}</span>
                    {entry.hint && <span className="cmdk-item-hint">{entry.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>,
    document.body,
  );
}
