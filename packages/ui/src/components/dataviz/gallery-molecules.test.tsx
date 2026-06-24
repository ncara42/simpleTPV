import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  ActivityFeed,
  BulletMeter,
  DonutStat,
  formatValue,
  HeatStrip,
  KpiStat,
  Leaderboard,
  rampColor,
  SparkArea,
  Treemap,
} from './index.js';

describe('formatValue eur0', () => {
  it('redondea a euros sin decimales', () => {
    expect(formatValue(11751.4, 'eur0')).toMatch(/11\.751\s?€/);
  });
});

describe('KpiStat', () => {
  it('pinta rótulo, valor, chip y sparkline', () => {
    const { container } = render(
      <KpiStat
        label="Facturación"
        value={63526.52}
        format="eur"
        chip={{ text: '↑ 12,4 %', tone: 'success' }}
        spark={[1, 4, 2, 6]}
      />,
    );
    expect(screen.getByText('Facturación')).toBeInTheDocument();
    expect(screen.getByText(/63\.526,52\s?€/)).toBeInTheDocument();
    expect(container.querySelector('.dv-kpistat-chip--success')).toBeInTheDocument();
    expect(container.querySelector('.dv-spark-area svg')).toBeInTheDocument();
  });

  it('valueText tiene prioridad sobre value/format', () => {
    render(<KpiStat label="Uds. / ticket" value={3.89} valueText="3,89" />);
    expect(screen.getByText('3,89')).toBeInTheDocument();
  });

  it('estado loading muestra el status en vez del valor', () => {
    render(<KpiStat label="Margen" value={null} state="loading" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('SparkArea', () => {
  it('con ≥2 puntos dibuja dos paths (área + línea)', () => {
    const { container } = render(<SparkArea data={[1, 3, 2, 5]} />);
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });
  it('con <2 puntos no dibuja svg', () => {
    const { container } = render(<SparkArea data={[1]} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('HeatStrip', () => {
  it('una celda por franja y marca el pico (mayor valor)', () => {
    const { container } = render(
      <HeatStrip
        items={[
          { label: '07', value: 10 },
          { label: '08', value: 90 },
          { label: '09', value: 40 },
        ]}
      />,
    );
    expect(container.querySelectorAll('.dv-heatcell')).toHaveLength(3);
    const peak = container.querySelector('.dv-heatcell.is-peak');
    expect(peak?.textContent).toBe('08');
  });

  it('lista vacía → estado vacío', () => {
    render(<HeatStrip items={[]} />);
    expect(screen.getByText('Sin datos.')).toBeInTheDocument();
  });
});

describe('Treemap', () => {
  it('respeta el orden de entrada y reparte en dos filas con >3 ítems', () => {
    const { container } = render(
      <Treemap
        items={[
          { label: 'A', value: 18 },
          { label: 'B', value: 17 },
          { label: 'C', value: 16 },
          { label: 'D', value: 8 },
          { label: 'Otras', value: 41 },
        ]}
      />,
    );
    expect(container.querySelectorAll('.dv-treemap-row')).toHaveLength(2);
    const names = Array.from(container.querySelectorAll('.dv-treemap-name')).map(
      (e) => e.textContent,
    );
    expect(names[0]).toBe('A'); // no reordena: el residual "Otras" queda al final
    expect(names[names.length - 1]).toBe('Otras');
  });
});

describe('DonutStat', () => {
  it('pinta un arco por categoría, la cifra central y la leyenda acotada', () => {
    const { container } = render(
      <DonutStat
        items={[
          { label: 'A', value: 50 },
          { label: 'B', value: 30 },
          { label: 'C', value: 20 },
        ]}
        format="integer"
        centerValue={100}
        centerCaption="3 familias"
        legendMax={2}
      />,
    );
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('3 familias')).toBeInTheDocument();
    expect(container.querySelectorAll('.dv-donutstat-legend-row')).toHaveLength(2);
  });
});

describe('BulletMeter', () => {
  it('muestra el cumplimiento sobre el objetivo con 1 decimal', () => {
    render(<BulletMeter value={63527} projection={79408} target={85000} format="eur0" />);
    expect(screen.getByText('74,7%')).toBeInTheDocument();
    expect(screen.getByText('93,4%')).toBeInTheDocument();
  });

  it('objetivo no positivo → estado vacío', () => {
    render(<BulletMeter value={10} target={0} />);
    expect(screen.getByText('Sin datos.')).toBeInTheDocument();
  });
});

describe('Leaderboard', () => {
  it('ordena por valor desc y marca el nº1', () => {
    const { container } = render(
      <Leaderboard
        items={[
          { label: 'Online', value: 100 },
          { label: 'Sur', value: 120 },
        ]}
        format="eur0"
      />,
    );
    const names = Array.from(container.querySelectorAll('.dv-leaderboard-name')).map(
      (e) => e.textContent,
    );
    expect(names).toEqual(['Sur', 'Online']);
    expect(container.querySelector('.dv-leaderboard-rank.is-top')?.textContent).toBe('1');
  });
});

describe('ActivityFeed', () => {
  it('pinta un hito por ítem con su tono', () => {
    const { container } = render(
      <ActivityFeed
        items={[
          { title: 'Venta', meta: 'Centro · 12:07', tone: 'accent' },
          { title: 'Rotura', meta: 'Sur · 16:45', tone: 'danger' },
        ]}
      />,
    );
    expect(container.querySelectorAll('.dv-feed-item')).toHaveLength(2);
    expect(container.querySelector('.dv-feed-dot--danger')).toBeInTheDocument();
  });
});

describe('rampColor', () => {
  it('deriva el color por color-mix con la marca (theme-aware)', () => {
    expect(rampColor(0)).toContain('color-mix');
    expect(rampColor(0)).toContain('--ui-brand');
  });
});
