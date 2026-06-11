import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type NavGroup, type NavItem, Sidebar } from './Sidebar.js';

const groups: NavGroup[] = [{ id: 'inv', label: 'Inventario', icon: <span>I</span> }];
const items: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <span>D</span> },
  { id: 'catalog', label: 'Catálogo', icon: <span>C</span>, group: 'inv' },
  { id: 'stock', label: 'Stock', icon: <span>S</span>, group: 'inv' },
];

function renderSidebar(extra: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(
    <Sidebar
      items={items}
      groups={groups}
      groupsAsDropdowns
      collapsible
      activeItem="dashboard"
      onSelect={vi.fn()}
      {...extra}
    />,
  );
}

describe('Sidebar (U-04 rail)', () => {
  beforeEach(() => window.localStorage.clear());

  it('contrae a rail con el botón y persiste en localStorage', () => {
    const { container } = renderSidebar();
    const aside = container.querySelector('aside.sidebar')!;
    expect(aside.classList.contains('collapsed')).toBe(false);

    fireEvent.click(screen.getByTestId('sidebar-collapse'));
    expect(aside.classList.contains('collapsed')).toBe(true);
    expect(window.localStorage.getItem('ui.sidebar.collapsed')).toBe('1');

    fireEvent.click(screen.getByTestId('sidebar-collapse'));
    expect(aside.classList.contains('collapsed')).toBe(false);
    expect(window.localStorage.getItem('ui.sidebar.collapsed')).toBe('0');
  });

  it('arranca contraído si localStorage lo recuerda', () => {
    window.localStorage.setItem('ui.sidebar.collapsed', '1');
    const { container } = renderSidebar();
    expect(container.querySelector('aside.sidebar.collapsed')).not.toBeNull();
  });

  it('sin collapsible no hay botón ni clase', () => {
    window.localStorage.setItem('ui.sidebar.collapsed', '1');
    const { container } = renderSidebar({ collapsible: false });
    expect(screen.queryByTestId('sidebar-collapse')).toBeNull();
    expect(container.querySelector('aside.sidebar.collapsed')).toBeNull();
  });

  it('contraído, el clic en un grupo ancla el flyout y navegar lo cierra', () => {
    const onSelect = vi.fn();
    renderSidebar({ onSelect });
    fireEvent.click(screen.getByTestId('sidebar-collapse'));

    fireEvent.click(screen.getByTestId('nav-group-inv'));
    expect(screen.getByTestId('nav-stock')).toBeVisible();

    fireEvent.click(screen.getByTestId('nav-stock'));
    expect(onSelect).toHaveBeenCalledWith('stock');
    expect(screen.queryByTestId('nav-stock')).toBeNull(); // flyout cerrado
  });
});
