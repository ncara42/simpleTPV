import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  DataGrid,
  type DataGridColumn,
  Gauge,
  HeroFigure,
  KpiDual,
  KpiStat,
  ProjectionArea,
  RibbonStat,
  ShareBar,
  SparkBars,
} from './index.js';

describe('SparkBars', () => {
  it('pinta una barra por dato y acentúa la última con accent="last"', () => {
    const { container } = render(<SparkBars data={[10, 20, 30, 90]} accent="last" />);
    const bars = container.querySelectorAll('.dv-sparkbars-bar');
    expect(bars).toHaveLength(4);
    expect((bars[3] as HTMLElement).style.background).toContain('--ui-brand');
    expect((bars[0] as HTMLElement).style.background).toContain('color-mix');
  });
});

describe('Gauge', () => {
  it('muestra el valor central y dibuja pista + relleno', () => {
    const { container } = render(<Gauge value={59.8} valueText="59,8%" />);
    expect(screen.getByText('59,8%')).toBeInTheDocument();
    expect(container.querySelector('.dv-gauge-track')).toBeInTheDocument();
    expect(container.querySelector('.dv-gauge-fill')).toBeInTheDocument();
  });
});

describe('ShareBar', () => {
  it('pinta un segmento y una fila de leyenda por categoría con su %', () => {
    const { container } = render(
      <ShareBar
        items={[
          { label: 'Efectivo', value: 80 },
          { label: 'Tarjeta', value: 20 },
        ]}
      />,
    );
    expect(container.querySelectorAll('.dv-sharebar-row')).toHaveLength(2);
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
  });
});

describe('ProjectionArea', () => {
  it('dibuja área+línea de la serie actual, línea de comparación y traza de proyección', () => {
    const { container } = render(
      <ProjectionArea
        actual={[10, 20, 30]}
        compare={[12, 24, 36, 48]}
        projectionEnd={60}
        totalPoints={4}
      />,
    );
    expect(container.querySelector('.dv-projarea-line')).toBeInTheDocument();
    expect(container.querySelector('.dv-projarea-compare')).toBeInTheDocument();
    expect(container.querySelector('.dv-projarea-proj')).toBeInTheDocument();
  });
  it('con menos de 2 puntos → estado vacío', () => {
    render(<ProjectionArea actual={[10]} />);
    expect(screen.getByText('Sin datos.')).toBeInTheDocument();
  });
});

describe('KpiDual', () => {
  it('apila dos métricas con sus rótulos y valores', () => {
    render(
      <KpiDual
        top={{ label: 'Margen', value: 59.8, valueText: '59,8%' }}
        bottom={{ label: 'Beneficio', value: 37992, format: 'eur0' }}
      />,
    );
    expect(screen.getByText('Margen')).toBeInTheDocument();
    expect(screen.getByText('59,8%')).toBeInTheDocument();
    expect(screen.getByText('Beneficio')).toBeInTheDocument();
    expect(screen.getByText(/37\.992\s?€/)).toBeInTheDocument();
  });
});

describe('HeroFigure', () => {
  it('pinta eyebrow, cifra grande y chips', () => {
    const { container } = render(
      <HeroFigure
        eyebrow="Facturación"
        badge="HERO"
        value={63526.52}
        format="eur"
        chips={[{ text: '762 tickets' }, { text: '↑ 12,4 %', tone: 'success' }]}
        spark={[1, 3, 2, 5]}
      />,
    );
    expect(screen.getByText(/63\.526,52\s?€/)).toBeInTheDocument();
    expect(screen.getByText('HERO')).toBeInTheDocument();
    expect(container.querySelectorAll('.dv-herofigure-chip')).toHaveLength(2);
    expect(container.querySelector('.dv-spark-area svg')).toBeInTheDocument();
  });
});

describe('RibbonStat', () => {
  it('pinta rótulo, valor y la mini-viz lateral', () => {
    const { container } = render(
      <RibbonStat
        label="Tickets"
        value={762}
        format="integer"
        aside={<span data-testid="aside" />}
      />,
    );
    expect(screen.getByText('Tickets')).toBeInTheDocument();
    expect(screen.getByText('762')).toBeInTheDocument();
    expect(container.querySelector('.dv-ribbon-aside')).toBeInTheDocument();
  });
});

describe('KpiStat (lote 2)', () => {
  it('tone="danger" tiñe la tarjeta de alerta', () => {
    const { container } = render(
      <KpiStat variant="card" tone="danger" label="Venta perdida" valueText="207,30 €" />,
    );
    expect(container.querySelector('.dv-kpistat--danger')).toBeInTheDocument();
  });
  it('con `bars` pinta SparkBars en vez de SparkArea', () => {
    const { container } = render(
      <KpiStat
        variant="card"
        label="Ventas / día"
        valueText="2.647 €"
        bars={[1, 2, 3, 9]}
        barsAccent="last"
      />,
    );
    expect(container.querySelector('.dv-kpistat-bars .dv-sparkbars')).toBeInTheDocument();
    expect(container.querySelector('.dv-spark-area')).toBeNull();
  });
});

describe('DataGrid (render + mono)', () => {
  it('usa render a medida y la clase mono', () => {
    const cols: DataGridColumn[] = [
      { key: 'id', header: 'Ticket', mono: true },
      {
        key: 'm',
        header: 'Método',
        render: (row) => <span className="dv-cell-badge">{String(row.m)}</span>,
      },
    ];
    const { container } = render(
      <DataGrid columns={cols} rows={[{ id: 'T06-1', m: 'Tarjeta' }]} />,
    );
    expect(container.querySelector('.dv-cell-mono')).toBeInTheDocument();
    expect(container.querySelector('.dv-cell-badge')?.textContent).toBe('Tarjeta');
  });
});
