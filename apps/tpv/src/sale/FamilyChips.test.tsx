import type { FamilyNode } from '@simpletpv/auth';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FamilyChips } from './FamilyChips.js';

function fam(id: string, children: FamilyNode[] = []): FamilyNode {
  return { id, parentId: null, name: id, color: null, icon: null, sortOrder: 0, children };
}

describe('FamilyChips', () => {
  it('en el nivel raíz muestra "Todas" y un chip por familia', () => {
    render(
      <FamilyChips
        families={[fam('Flores'), fam('Aceites')]}
        familyId={null}
        parentFamily={null}
        setFamilyId={vi.fn()}
        setParentFamily={vi.fn()}
      />,
    );
    expect(screen.getByTestId('fam-chip-all')).toBeInTheDocument();
    expect(screen.getAllByTestId('fam-chip')).toHaveLength(2);
  });

  it('al pulsar una familia con subfamilias entra en ella', () => {
    const setFamilyId = vi.fn();
    const setParentFamily = vi.fn();
    const flores = fam('Flores', [fam('Indica')]);
    render(
      <FamilyChips
        families={[flores]}
        familyId={null}
        parentFamily={null}
        setFamilyId={setFamilyId}
        setParentFamily={setParentFamily}
      />,
    );
    fireEvent.click(screen.getByText(/Flores/));
    expect(setFamilyId).toHaveBeenCalledWith('Flores');
    expect(setParentFamily).toHaveBeenCalledWith(flores);
  });

  it('dentro de una familia muestra "Volver" y "Todo · Familia"', () => {
    render(
      <FamilyChips
        families={[]}
        familyId={null}
        parentFamily={fam('Flores', [fam('Indica')])}
        setFamilyId={vi.fn()}
        setParentFamily={vi.fn()}
      />,
    );
    expect(screen.getByTestId('fam-back')).toBeInTheDocument();
    expect(screen.getByTestId('fam-chip-parent')).toBeInTheDocument();
  });
});
