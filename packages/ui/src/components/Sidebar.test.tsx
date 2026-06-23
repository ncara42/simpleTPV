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

  it('contraído, el clic en un grupo abre el flyout y navegar lo cierra', () => {
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

describe('Sidebar (S-05 dropdowns solo por clic)', () => {
  beforeEach(() => window.localStorage.clear());

  it('el hover sobre un grupo NO abre el flyout (anti-hover)', () => {
    renderSidebar();
    const group = screen.getByTestId('nav-group-inv');

    fireEvent.mouseEnter(group.parentElement!);
    fireEvent.mouseEnter(group);

    // Sin clic, el contenido del grupo permanece oculto y aria-expanded=false.
    expect(screen.queryByTestId('nav-stock')).toBeNull();
    expect(group).toHaveAttribute('aria-expanded', 'false');
  });

  it('el clic togglea: abre con el primer clic y cierra con el segundo', () => {
    renderSidebar();
    const group = screen.getByTestId('nav-group-inv');

    fireEvent.click(group);
    expect(screen.getByTestId('nav-stock')).toBeVisible();
    expect(group).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(group);
    expect(screen.queryByTestId('nav-stock')).toBeNull();
    expect(group).toHaveAttribute('aria-expanded', 'false');
  });

  it('abrir un segundo grupo cierra el primero (solo uno abierto)', () => {
    const twoGroups: NavGroup[] = [
      { id: 'inv', label: 'Inventario', icon: <span>I</span> },
      { id: 'cfg', label: 'Ajustes', icon: <span>A</span> },
    ];
    const twoGroupItems: NavItem[] = [
      { id: 'dashboard', label: 'Dashboard', icon: <span>D</span> },
      { id: 'stock', label: 'Stock', icon: <span>S</span>, group: 'inv' },
      { id: 'users', label: 'Usuarios', icon: <span>U</span>, group: 'cfg' },
    ];
    renderSidebar({ groups: twoGroups, items: twoGroupItems });

    fireEvent.click(screen.getByTestId('nav-group-inv'));
    expect(screen.getByTestId('nav-stock')).toBeVisible();

    fireEvent.click(screen.getByTestId('nav-group-cfg'));
    expect(screen.getByTestId('nav-users')).toBeVisible();
    expect(screen.queryByTestId('nav-stock')).toBeNull(); // el primero se cerró
  });

  it('el clic fuera del nav cierra el grupo abierto', () => {
    renderSidebar();
    fireEvent.click(screen.getByTestId('nav-group-inv'));
    expect(screen.getByTestId('nav-stock')).toBeVisible();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('nav-stock')).toBeNull();
  });

  it('Escape cierra el grupo abierto', () => {
    renderSidebar();
    fireEvent.click(screen.getByTestId('nav-group-inv'));
    expect(screen.getByTestId('nav-stock')).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('nav-stock')).toBeNull();
  });
});

describe('Sidebar (S-27 entradas directas)', () => {
  beforeEach(() => window.localStorage.clear());

  // Tras S-27, los dominios sin `group` se pintan como entradas DIRECTAS (1 clic)
  // respetando el orden del array fuente; las pages con `group` quedan bajo su
  // dropdown. Este caso fija ese contrato del render (Sidebar no se toca en S-27).
  it('renderiza los items sin grupo como entradas directas en el orden de la fuente', () => {
    const ordered: NavItem[] = [
      { id: 'dashboard', label: 'Dashboard', icon: <span>D</span> },
      { id: 'sales', label: 'Ventas', icon: <span>V</span> },
      { id: 'catalog', label: 'Catálogo', icon: <span>C</span> },
      { id: 'stock', label: 'Inventario', icon: <span>S</span> },
      { id: 'suppliers', label: 'Proveedores', icon: <span>P</span> },
      { id: 'families', label: 'Familias', icon: <span>F</span>, group: 'inv' },
    ];
    renderSidebar({ items: ordered });

    const directIds = ['dashboard', 'sales', 'catalog', 'stock', 'suppliers'];
    const rendered = directIds.map((id) => screen.getByTestId(`nav-${id}`));
    rendered.forEach((el) => expect(el).toBeVisible());

    // El orden del DOM coincide con el de la fuente (cada uno precede al siguiente).
    for (let i = 1; i < rendered.length; i++) {
      const precedes =
        rendered[i - 1]!.compareDocumentPosition(rendered[i]!) & Node.DOCUMENT_POSITION_FOLLOWING;
      expect(precedes).toBeTruthy();
    }

    // La page con grupo NO es una entrada directa: vive bajo el dropdown del grupo.
    expect(screen.getByTestId('nav-group-inv')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-families')).toBeNull();
  });
});
