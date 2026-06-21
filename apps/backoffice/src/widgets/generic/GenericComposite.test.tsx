import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CompositeNode, GenericSpec } from '../../lib/dashboard-layout.js';

// Mock del despachador para aislar el render del contenedor del fetch de cada hoja: cada
// GenericWidget se pinta mostrando su título (el composite delega el rótulo de la hoja al widget)
// y, si no hay, su endpoint.
vi.mock('./GenericWidget.js', () => ({
  GenericWidget: ({ spec }: { spec: { title?: string; endpoint: string } }) => (
    <div data-testid="leaf-widget">{spec.title || spec.endpoint}</div>
  ),
}));

import { GenericComposite } from './GenericComposite.js';

// Hoja de prueba con los campos mínimos de un GenericSpec (sin `root`).
function leaf(endpoint: string, title?: string): CompositeNode {
  return {
    kind: 'leaf',
    ...(title ? { title } : {}),
    spec: { type: 'bar', endpoint, title: title ?? endpoint, defaultSize: { w: 2, h: 2 } },
  };
}

function compositeSpec(root: CompositeNode): GenericSpec {
  return { type: 'composite', endpoint: '', title: 'Panel', defaultSize: { w: 8, h: 5 }, root };
}

describe('GenericComposite (#189)', () => {
  it('renderiza dos hojas en fila', () => {
    render(
      <GenericComposite
        spec={compositeSpec({
          kind: 'stack',
          dir: 'row',
          children: [leaf('/dashboard/sales-by-employee'), leaf('/dashboard/sales-kpis')],
        })}
      />,
    );
    expect(screen.getAllByTestId('leaf-widget')).toHaveLength(2);
    expect(screen.getByText('/dashboard/sales-by-employee')).toBeInTheDocument();
    expect(screen.getByText('/dashboard/sales-kpis')).toBeInTheDocument();
  });

  it('renderiza el título de sección de una hoja cuando existe', () => {
    render(
      <GenericComposite
        spec={compositeSpec({
          kind: 'stack',
          dir: 'col',
          children: [leaf('/dashboard/sales-by-hour', 'Ventas/hora')],
        })}
      />,
    );
    expect(screen.getByText('Ventas/hora')).toBeInTheDocument();
  });

  it('respeta MAX_COMPOSITE_DEPTH — no renderiza más allá del límite', () => {
    // stack(0) → stack(1) → stack(2) → leaf(3): la hoja al cuarto nivel no debe renderizarse.
    render(
      <GenericComposite
        spec={compositeSpec({
          kind: 'stack',
          dir: 'col',
          children: [
            {
              kind: 'stack',
              dir: 'col',
              children: [
                { kind: 'stack', dir: 'col', children: [leaf('/dashboard/sales-kpis', 'Nivel4')] },
              ],
            },
          ],
        })}
      />,
    );
    expect(screen.queryByTestId('leaf-widget')).toBeNull();
    expect(screen.queryByText('Nivel4')).toBeNull();
  });

  it('un árbol vacío no rompe el render', () => {
    const { container } = render(
      <GenericComposite spec={compositeSpec({ kind: 'stack', dir: 'col', children: [] })} />,
    );
    expect(container).toBeTruthy();
    expect(screen.queryByTestId('leaf-widget')).toBeNull();
    // El título de la tarjeta sí se pinta.
    expect(screen.getByText('Panel')).toBeInTheDocument();
  });
});
