import { Select } from '@simpletpv/ui';

import type { FamilyNode } from '../lib/catalog.js';

function isWithin(family: FamilyNode, familyId: string | null): boolean {
  if (familyId === null) return false;
  if (family.id === familyId) return true;
  return family.children.some((c) => isWithin(c, familyId));
}

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
        Todas
      </button>
      {families.map((f) =>
        f.children.length > 0 ? (
          <Select
            key={f.id}
            className={`fam-select${isWithin(f, familyId) ? ' is-active' : ''}`}
            value={isWithin(f, familyId) ? (familyId as string) : ''}
            onChange={(v) => setFamilyId(v)}
            triggerLabel={f.name}
            ariaLabel={`Familia ${f.name}`}
            data-testid="fam-select"
            options={[
              { value: f.id, label: `Todo · ${f.name}` },
              ...f.children.map((s) => ({
                value: s.id,
                label: s.name,
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
            {f.name}
          </button>
        ),
      )}
    </div>
  );
}
