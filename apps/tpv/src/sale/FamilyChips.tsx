import { DEMO_FAMILY_COUNTS, DEMO_TOTAL_COUNT } from '../demo/demoData.js';
import type { FamilyNode } from '../lib/catalog.js';

// Navegación de familias en dos pasos: la fila de chips muestra las familias raíz
// o, al entrar en una con subfamilias, "Volver" + "Todo · Familia" + sus hijas.
// Presentacional: el estado (familyId/parentFamily) vive en SalePage.
export function FamilyChips({
  families,
  familyId,
  parentFamily,
  setFamilyId,
  setParentFamily,
}: {
  families: FamilyNode[];
  familyId: string | null;
  parentFamily: FamilyNode | null;
  setFamilyId: (id: string | null) => void;
  setParentFamily: (f: FamilyNode | null) => void;
}) {
  return (
    <div className="sale-families" data-testid="sale-families">
      {parentFamily ? (
        <>
          {/* Dentro de una familia: volver + "Todo · Familia" + subfamilias. */}
          <button
            type="button"
            className="fam-chip fam-back"
            onClick={() => {
              setParentFamily(null);
              setFamilyId(null);
            }}
            data-testid="fam-back"
          >
            ‹ Volver
          </button>
          <button
            className={`fam-chip ${familyId === parentFamily.id ? 'active' : ''}`}
            onClick={() => setFamilyId(parentFamily.id)}
            data-testid="fam-chip-parent"
          >
            <span
              className="chip-dot"
              style={{ background: parentFamily.color ?? 'var(--ui-text-soft)' }}
            />
            Todo · {parentFamily.name}{' '}
            <span className="chip-count">{DEMO_FAMILY_COUNTS[parentFamily.id] ?? 0}</span>
          </button>
          {parentFamily.children.map((s) => (
            <button
              key={s.id}
              className={`fam-chip ${familyId === s.id ? 'active' : ''}`}
              onClick={() => setFamilyId(s.id)}
              data-testid="fam-chip"
            >
              <span className="chip-dot" style={{ background: s.color ?? 'var(--ui-text-soft)' }} />
              {s.name} <span className="chip-count">{DEMO_FAMILY_COUNTS[s.id] ?? 0}</span>
            </button>
          ))}
        </>
      ) : (
        <>
          <button
            className={`fam-chip ${familyId === null ? 'active' : ''}`}
            onClick={() => {
              setFamilyId(null);
              setParentFamily(null);
            }}
            data-testid="fam-chip-all"
          >
            Todas <span className="chip-count">{DEMO_TOTAL_COUNT}</span>
          </button>
          {families.map((f) => (
            <button
              key={f.id}
              className={`fam-chip ${familyId === f.id ? 'active' : ''}`}
              // Familia con subfamilias → entra en ella; familia hoja → filtra directo.
              onClick={() => {
                setFamilyId(f.id);
                setParentFamily(f.children.length > 0 ? f : null);
              }}
              data-testid="fam-chip"
            >
              <span className="chip-dot" style={{ background: f.color ?? 'var(--ui-text-soft)' }} />
              {f.name}
              {f.children.length > 0 && <span className="fam-chevron"> ›</span>}{' '}
              <span className="chip-count">{DEMO_FAMILY_COUNTS[f.id] ?? 0}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
