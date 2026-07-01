import { initials } from '@simpletpv/ui';
import { Search } from 'lucide-react';

import { useScrollShadow } from '../hooks/use-scroll-shadow.js';
import type { Store } from '../lib/admin.js';
import { fmtEur } from '../lib/format.js';

interface StoreListProps {
  /** Tiendas YA filtradas por búsqueda y ordenadas por ventas del periodo (desc). */
  stores: Store[];
  /** Ventas del periodo por tienda (id → importe); 0/ausente = sin ventas. */
  salesByStore: Map<string, number>;
  query: string;
  onSearch: (value: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** «N ubicaciones» o «N de M» cuando hay búsqueda activa. */
  countLabel: string;
  /** Total formateado de las tiendas visibles (ya en €). */
  totalStr: string;
}

// Panel 1 (lista): buscador + tiendas ordenadas por ventas del periodo. Espejo de
// sales/SalesList.tsx (mismo patrón de fila seleccionable + cabecera de recuento).
// Presentacional puro: StoresPage filtra/ordena y pasa selección/manejadores.
export function StoreList({
  stores,
  salesByStore,
  query,
  onSearch,
  selectedId,
  onSelect,
  countLabel,
  totalStr,
}: StoreListProps) {
  const { scrollRef, sentinelRef, showShadow } = useScrollShadow();
  return (
    <aside className="store-list" data-testid="store-list">
      <div className="store-list-search">
        <Search size={17} aria-hidden="true" />
        <input
          className="store-search-input"
          placeholder="Buscar tienda…"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          data-testid="store-search"
        />
      </div>
      <div
        className={`store-list-body scroll-shadow-host${showShadow ? ' has-scroll-shadow' : ''}`}
      >
        <div className="store-list-head">
          <span className="store-list-count">{countLabel}</span>
          <span className="store-list-total">
            Total <strong>{totalStr}</strong>
          </span>
        </div>
        {stores.length === 0 ? (
          <div className="store-list-empty" data-testid="store-list-empty">
            Sin tiendas para «{query}».
          </div>
        ) : (
          <div className="store-list-scroll" ref={scrollRef}>
            {stores.map((s) => {
              const sales = salesByStore.get(s.id) ?? 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`store-lrow${s.id === selectedId ? ' is-sel' : ''}`}
                  onClick={() => onSelect(s.id)}
                  data-testid="store-lrow"
                >
                  <span
                    className={`store-lrow-avatar${s.active ? ' is-active' : ' is-dormant'}`}
                    aria-hidden="true"
                  >
                    {initials(s.name)}
                  </span>
                  <span className="store-lrow-main">
                    <span className="store-lrow-name">
                      <span className="store-lrow-name-txt">{s.name}</span>
                      {s.isCentral && (
                        <svg
                          className="store-lrow-star"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          stroke="none"
                          aria-label="Tienda central"
                        >
                          <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      )}
                    </span>
                    <span className="store-lrow-addr">{s.address ?? '—'}</span>
                  </span>
                  <span className="store-lrow-end">
                    <span
                      className={`store-lrow-sales${sales === 0 ? ' is-zero' : ''}`}
                      data-testid="store-sales"
                    >
                      {fmtEur(sales)}
                    </span>
                    <span
                      className={`store-lrow-micro${s.active ? ' is-active' : ' is-dormant'}`}
                      data-testid="store-status"
                    >
                      <span className="store-lrow-micro-dot" />
                      {s.active ? 'Activa' : 'Dormida'}
                    </span>
                  </span>
                </button>
              );
            })}
            {/* Centinela de fin de scroll: cuando entra en el viewport del scroller,
                estamos al fondo y la sombra inferior se difumina. */}
            <span className="scroll-shadow-sentinel" ref={sentinelRef} aria-hidden="true" />
          </div>
        )}
      </div>
    </aside>
  );
}
