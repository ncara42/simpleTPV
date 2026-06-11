import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Tab } from '../lib/nav.js';
import { searchFunctions } from '../lib/searchIndex.js';

// U-06: búsqueda de funciones del header. Busca en el índice estático (pages y
// acciones con sinónimos) y NAVEGA al seleccionar. V1 no busca datos. Atajo
// global Ctrl/Cmd+K. Teclado: ↑/↓ + Enter; Escape cierra y devuelve el foco.
export function FunctionSearch({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = searchFunctions(query);

  // Atajo global Ctrl/Cmd+K → foco en la búsqueda.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Cierre por clic fuera (patrón de Select/Sidebar).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const go = useCallback(
    (tab: Tab) => {
      onNavigate(tab);
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    },
    [onNavigate],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setCursor((c) => (c + dir + results.length) % results.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results[cursor] ?? results[0];
      if (hit) go(hit.tab);
    }
  };

  return (
    <div className="topbar-search" ref={rootRef} data-testid="function-search">
      <Search size={15} aria-hidden="true" className="topbar-search-icon" />
      <input
        ref={inputRef}
        type="search"
        className="topbar-search-input"
        placeholder="Buscar funciones…  (Ctrl+K)"
        value={query}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-label="Buscar funciones"
        aria-autocomplete="list"
        aria-controls="function-search-results"
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(0);
          setOpen(true);
        }}
        onFocus={() => query && setOpen(true)}
        onKeyDown={onKeyDown}
        data-testid="function-search-input"
      />
      {open && query.trim() !== '' && (
        <ul
          className="ui-menu topbar-search-results"
          id="function-search-results"
          role="listbox"
          data-testid="function-search-results"
        >
          {results.length === 0 && <li className="ui-menu-empty">Sin funciones para “{query}”</li>}
          {results.map((r, i) => (
            <li key={`${r.tab}-${r.label}`} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={i === cursor}
                className={`ui-menu-item${i === cursor ? ' is-active' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(r.tab)}
                data-testid={`function-search-result-${r.tab}`}
              >
                <span className="ui-menu-item-label">{r.label}</span>
                <span className="ui-menu-item-hint">{r.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
