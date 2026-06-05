import type { FamilyNode } from '@simpletpv/auth';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FamilyChips } from './FamilyChips.js';

function fam(id: string, children: FamilyNode[] = []): FamilyNode {
  return { id, parentId: null, name: id, color: null, icon: null, sortOrder: 0, children };
}

describe('FamilyChips', () => {
  it('en el nivel raíz muestra "Todas" y una píldora por familia hoja', () => {
    render(
      <FamilyChips
        families={[fam('Flores'), fam('Aceites')]}
        familyId={null}
        setFamilyId={vi.fn()}
      />,
    );
    expect(screen.getByTestId('fam-chip-all')).toBeInTheDocument();
    expect(screen.getAllByTestId('fam-chip')).toHaveLength(2);
  });

  it('una familia hoja filtra directo al pulsarla', () => {
    const setFamilyId = vi.fn();
    render(<FamilyChips families={[fam('Flores')]} familyId={null} setFamilyId={setFamilyId} />);
    fireEvent.click(screen.getByText(/Flores/));
    expect(setFamilyId).toHaveBeenCalledWith('Flores');
  });

  it('una familia con subfamilias se muestra como desplegable, no como chip', () => {
    const flores = fam('Flores', [fam('Indica')]);
    render(<FamilyChips families={[flores]} familyId={null} setFamilyId={vi.fn()} />);
    expect(screen.queryByTestId('fam-chip')).toBeNull();
    expect(screen.getByRole('button', { name: 'Familia Flores' })).toBeInTheDocument();
  });

  it('al elegir una subfamilia del desplegable filtra por ella', () => {
    const setFamilyId = vi.fn();
    const flores = fam('Flores', [fam('Indica')]);
    render(<FamilyChips families={[flores]} familyId={null} setFamilyId={setFamilyId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Familia Flores' }));
    fireEvent.click(screen.getByText('Indica'));
    expect(setFamilyId).toHaveBeenCalledWith('Indica');
  });
});
