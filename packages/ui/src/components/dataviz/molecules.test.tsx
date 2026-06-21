import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KpiTile, ProgressMeter, RankBarList, SegmentBar } from './index.js';

describe('KpiTile', () => {
  it('pinta rótulo + valor; con delta muestra la insignia', () => {
    const { container } = render(
      <KpiTile label="Facturación" value={84560.09} format="eur" delta={12} />,
    );
    expect(screen.getByText('Facturación')).toBeInTheDocument();
    expect(screen.getByText(/84\.560,09\s?€/)).toBeInTheDocument();
    expect(container.querySelector('.dv-delta--up')).toBeInTheDocument();
  });

  it('estado loading muestra el status en vez del valor', () => {
    render(<KpiTile label="Margen" value={null} state="loading" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('pinta sparkline si hay serie de ≥2 puntos', () => {
    const { container } = render(
      <KpiTile label="Ventas" value={100} spark={[1, 2, 3, 4]} sparkTone="success" />,
    );
    expect(container.querySelector('.dv-mini-spark')).toBeInTheDocument();
  });
});

describe('RankBarList', () => {
  it('ordena por valor desc y formatea', () => {
    render(
      <RankBarList
        items={[
          { label: 'Café', value: 10 },
          { label: 'Té', value: 30 },
          { label: 'Agua', value: 20 },
        ]}
        format="integer"
      />,
    );
    const labels = Array.from(document.querySelectorAll('.dv-rank-label')).map(
      (e) => e.textContent,
    );
    expect(labels).toEqual(['Té', 'Agua', 'Café']);
  });

  it('acota a maxRows (clamp a 10)', () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ label: `P${i}`, value: i }));
    render(<RankBarList items={items} maxRows={50} />);
    expect(document.querySelectorAll('.dv-rank-row')).toHaveLength(10);
  });

  it('lista vacía → estado vacío; error → estado error', () => {
    const { rerender } = render(<RankBarList items={[]} />);
    expect(screen.getByText('Sin datos.')).toBeInTheDocument();
    rerender(<RankBarList items={[]} isError />);
    expect(screen.getByText('No se pudieron cargar los datos.')).toBeInTheDocument();
  });
});

describe('SegmentBar', () => {
  it('pinta un segmento por categoría y la leyenda con su % de reparto', () => {
    const { container } = render(
      <SegmentBar
        items={[
          { label: 'A', value: 75 },
          { label: 'B', value: 25 },
        ]}
      />,
    );
    expect(container.querySelectorAll('.dv-segment-part')).toHaveLength(2);
    expect(screen.getByText('A · 75%')).toBeInTheDocument();
    expect(screen.getByText('B · 25%')).toBeInTheDocument();
  });

  it('total 0 → estado vacío', () => {
    render(<SegmentBar items={[{ label: 'A', value: 0 }]} />);
    expect(screen.getByText('Sin datos.')).toBeInTheDocument();
  });
});

describe('ProgressMeter', () => {
  it('expone progressbar con aria-valuenow = % del objetivo', () => {
    render(<ProgressMeter label="Meta" value={80} target={100} format="eur" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '80');
  });

  it('clampa por encima del objetivo a 100', () => {
    render(<ProgressMeter value={150} target={100} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('sin valor → estado vacío', () => {
    render(<ProgressMeter value={null} target={100} />);
    expect(screen.getByText('Sin datos.')).toBeInTheDocument();
  });
});
