import type { FacetSection } from '@simpletpv/ui';

import { ScrollShadowCell } from './ScrollShadowCell.js';

// Carril de facetas reutilizable del backoffice (mismo lenguaje visual que el
// carril de Existencias/Catálogo: clases `.cat-rail`/`.cat-facet`/`.cat-view`/
// `.cat-facet-opt`). Recibe un buscador opcional y secciones (vistas de selección
// única o checks multi-selección) y las pinta; es presentacional puro. Permite que
// TODAS las tablas navegables compartan el mismo aspecto (carril + tabla agrupada)
// sin reescribir el carril en cada página.

interface FacetRailProps {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    testId?: string;
  };
  sections: FacetSection[];
  ariaLabel?: string;
  testId?: string;
}

export function FacetRail({ search, sections, ariaLabel, testId }: FacetRailProps) {
  return (
    <ScrollShadowCell as="aside" className="cat-rail" aria-label={ariaLabel} data-testid={testId}>
      {search && (
        <span className="search-field cat-rail-search">
          <input
            className="catalog-search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            data-testid={search.testId}
          />
        </span>
      )}
      {sections.map((section, i) =>
        section.kind === 'views' ? (
          <section className="cat-facet" key={section.title ?? `views-${i}`}>
            {section.title && <h3 className="cat-facet-title">{section.title}</h3>}
            {section.options.map((opt) => {
              const active = section.active === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={`cat-view${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => section.onSelect(opt.key)}
                  data-testid={
                    section.testIdPrefix ? `${section.testIdPrefix}-${opt.key}` : undefined
                  }
                >
                  <span className="cat-view-label">{opt.label}</span>
                  {opt.count !== undefined && <span className="cat-view-count">{opt.count}</span>}
                </button>
              );
            })}
          </section>
        ) : (
          <section className="cat-facet" key={section.title}>
            <h3 className="cat-facet-title">{section.title}</h3>
            {section.options.map((opt) => {
              const checked = section.selected.has(opt.key);
              return (
                <label key={opt.key} className={`cat-facet-opt${checked ? ' is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    className="cat-facet-input"
                    checked={checked}
                    onChange={() => section.onToggle(opt.key)}
                    data-testid={
                      section.testIdPrefix ? `${section.testIdPrefix}-${opt.key}` : undefined
                    }
                  />
                  <span className="cat-check" aria-hidden="true" />
                  <span
                    className="cat-facet-label"
                    style={opt.color ? { color: opt.color } : undefined}
                  >
                    {opt.label}
                  </span>
                  {opt.count !== undefined && <span className="cat-facet-count">{opt.count}</span>}
                </label>
              );
            })}
          </section>
        ),
      )}
    </ScrollShadowCell>
  );
}
