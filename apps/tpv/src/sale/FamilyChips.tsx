import { Select } from '@simpletpv/ui';

import { DEMO_FAMILY_COUNTS, DEMO_TOTAL_COUNT } from '../demo/demoData.js';
import type { FamilyNode } from '../lib/catalog.js';

// ¿La familia seleccionada (`familyId`) cae dentro del subárbol de `family`?
// Sirve para resaltar el desplegable de una familia cuando una de sus
// subfamilias está activa.
function isWithin(family: FamilyNode, familyId: string | null): boolean {
  if (familyId === null) return false;
  if (family.id === familyId) return true;
  return family.children.some((c) => isWithin(c, familyId));
}

// Filtro de familias en Venta, con el lenguaje visual del backoffice: píldoras
// completamente redondas. Las familias hoja filtran directo; las que tienen
// subfamilias se muestran como un desplegable (el mismo <Select> que los filtros
// del backoffice) para elegir "Todo · Familia" o una subfamilia, sin cambiar de
// pantalla. Presentacional: el estado (familyId) vive en SalePage.
export function FamilyChips({
  families,
  familyId,
  setFamilyId,
}: {
  families: FamilyNode[];
  familyId: string | null;
  setFamilyId: (id: string | null) => void;
}) {
  return (
    <div className="sale-families" data-testid="sale-families">
      <button
        type="button"
        className={`fam-chip ${familyId === null ? 'active' : ''}`}
        onClick={() => setFamilyId(null)}
        data-testid="fam-chip-all"
      >
        Todas <span className="chip-count">{DEMO_TOTAL_COUNT}</span>
      </button>
      {families.map((f) =>
        f.children.length > 0 ? (
          // Familia con subfamilias → desplegable. "Todo · Familia" filtra por
          // todo el subárbol; cada subfamilia filtra por sí misma.
          <Select
            key={f.id}
            className={`fam-select${isWithin(f, familyId) ? ' is-active' : ''}`}
            // El valor solo es de esta familia si la selección activa cae en su
            // subárbol; así su menú no se atenúa cuando hay otra familia activa.
            value={isWithin(f, familyId) ? (familyId as string) : ''}
            onChange={(v) => setFamilyId(v)}
            triggerLabel={f.name}
            triggerCount={DEMO_FAMILY_COUNTS[f.id] ?? 0}
            ariaLabel={`Familia ${f.name}`}
            data-testid="fam-select"
            options={[
              { value: f.id, label: `Todo · ${f.name}`, count: DEMO_FAMILY_COUNTS[f.id] ?? 0 },
              ...f.children.map((s) => ({
                value: s.id,
                label: s.name,
                count: DEMO_FAMILY_COUNTS[s.id] ?? 0,
              })),
            ]}
          />
        ) : (
          <button
            key={f.id}
            type="button"
            className={`fam-chip ${familyId === f.id ? 'active' : ''}`}
            onClick={() => setFamilyId(f.id)}
            data-testid="fam-chip"
          >
            {f.name} <span className="chip-count">{DEMO_FAMILY_COUNTS[f.id] ?? 0}</span>
          </button>
        ),
      )}
    </div>
  );
}
