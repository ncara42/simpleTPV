import type { FeatureKey } from '@simpletpv/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listStores } from './lib/admin.js';
import { clearFeatureFlag, listFeatureFlags, setFeatureFlag } from './lib/features.js';
import { usePageHeader } from './lib/pageHeader.js';

// Estado tri-estado de una celda: 'default' = sin fila (hereda: en la columna de org,
// el default del código; en una tienda, el default de org). 'on'/'off' = explícito.
type CellState = 'default' | 'on' | 'off';

const CELL_OPTIONS: Array<{ value: CellState; label: string }> = [
  { value: 'default', label: 'Por defecto' },
  { value: 'on', label: 'Activado' },
  { value: 'off', label: 'Apagado' },
];

// Gestión de feature flags (#127 B): matriz módulos × [Org + tiendas]. Cada celda fija
// (PUT) o quita (DELETE → vuelve al default) un flag. El backend resuelve la
// precedencia tienda ?? org ?? código y es la fuente de verdad (403 si está apagado).
export function ModulesPage() {
  const qc = useQueryClient();
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const { data: admin, isLoading } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: listFeatureFlags,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['feature-flags'] });
    // Refresca el estado efectivo que usa el ocultado de nav (useFeatures).
    void qc.invalidateQueries({ queryKey: ['features'] });
  };

  const mut = useMutation({
    mutationFn: (v: { key: FeatureKey; storeId?: string; state: CellState }) =>
      v.state === 'default'
        ? clearFeatureFlag(v.key, v.storeId)
        : setFeatureFlag(v.key, v.state === 'on', v.storeId),
    onSuccess: invalidate,
  });

  usePageHeader('Módulos', 'Activa o desactiva módulos por tienda u organización');

  const catalog = admin?.catalog ?? [];
  const flags = admin?.flags ?? [];

  const cellState = (key: string, storeId: string | null): CellState => {
    const row = flags.find((f) => f.key === key && f.storeId === storeId);
    return row ? (row.enabled ? 'on' : 'off') : 'default';
  };

  const onChange = (key: FeatureKey, storeId: string | undefined, value: CellState): void => {
    mut.mutate({ key, ...(storeId ? { storeId } : {}), state: value });
  };

  return (
    <section className="catalog">
      {isLoading ? (
        <p className="catalog-empty">Cargando…</p>
      ) : (
        <div className="table-panel">
          <p className="muted modules-hint">
            «Por defecto» hereda: en <strong>Org</strong>, el valor de fábrica del módulo; en una
            tienda, lo que diga Org. Un valor explícito (Activado/Apagado) manda sobre lo heredado.
          </p>
          <div className="modules-matrix-scroll">
            <table className="catalog-table" data-testid="modules-matrix">
              <thead>
                <tr>
                  <th>Módulo</th>
                  <th>Org (todas)</th>
                  {stores.map((s) => (
                    <th key={s.id}>{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {catalog.map((mod) => (
                  <tr key={mod.key} data-testid="modules-row">
                    <td>{mod.label}</td>
                    <td>
                      <select
                        className="modules-cell"
                        aria-label={`${mod.label} · Org`}
                        value={cellState(mod.key, null)}
                        onChange={(e) => onChange(mod.key, undefined, e.target.value as CellState)}
                        data-testid={`modules-cell-${mod.key}-org`}
                      >
                        {CELL_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    {stores.map((s) => (
                      <td key={s.id}>
                        <select
                          className="modules-cell"
                          aria-label={`${mod.label} · ${s.name}`}
                          value={cellState(mod.key, s.id)}
                          onChange={(e) => onChange(mod.key, s.id, e.target.value as CellState)}
                          data-testid={`modules-cell-${mod.key}-${s.id}`}
                        >
                          {CELL_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
