import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formatAxisValue } from './format.js';
import {
  ChartLegend,
  DeltaBadge,
  formatDelta,
  formatValue,
  MiniSparkline,
  SectionHeader,
  StatLabel,
  StatusPill,
  StatValue,
  TrendCaption,
  WidgetStates,
} from './index.js';

describe('formatValue (es-ES)', () => {
  it('formatea euros (miles con ., decimal coma, NBSP antes de €)', () => {
    // Intl es-ES usa espacio no-rompible (U+00A0) antes del símbolo de moneda.
    expect(formatValue(84560.09, 'eur')).toBe('84.560,09 €');
  });
  it('formatea porcentaje con sufijo', () => {
    expect(formatValue(3.5, 'percent')).toBe('3,5 %');
  });
  it('percentRatio multiplica una fracción 0..1 ×100', () => {
    expect(formatValue(0.15, 'percentRatio')).toBe('15 %');
    expect(formatValue(0.1534, 'percentRatio')).toBe('15,34 %');
    expect(formatValue(0, 'percentRatio')).toBe('0 %');
  });
  it('formatea decimal a máx 2', () => {
    expect(formatValue(3.766, 'decimal')).toBe('3,77');
  });
  it('formatea unidades enteras con sufijo (4 dígitos sin agrupar, regla es-ES)', () => {
    expect(formatValue(1200, 'units')).toBe('1200 uds.');
  });
  it('formatea entero: agrupa a partir de 5 dígitos, no en 4 (es-ES)', () => {
    expect(formatValue(1087, 'integer')).toBe('1087');
    expect(formatValue(10870, 'integer')).toBe('10.870');
  });
  it('devuelve — para nulo/no finito', () => {
    expect(formatValue(null, 'eur')).toBe('—');
    expect(formatValue(undefined, 'decimal')).toBe('—');
    expect(formatValue(Number.NaN, 'integer')).toBe('—');
  });
});

describe('formatAxisValue (etiquetas de eje compactas)', () => {
  it('abrevia magnitudes (eur/units/decimal/integer) para no recortarse en el gutter', () => {
    expect(formatAxisValue(10000, 'eur')).toBe('10k');
    expect(formatAxisValue(84560.09, 'eur')).toBe('84,6k');
    expect(formatAxisValue(1200000, 'eur')).toBe('1,2M');
    expect(formatAxisValue(850, 'eur')).toBe('850');
    expect(formatAxisValue(10870, 'units')).toBe('10,9k');
  });
  it('mantiene el % en tasas (si no, "60" confunde)', () => {
    expect(formatAxisValue(60, 'percent')).toBe('60 %');
    expect(formatAxisValue(0.6, 'percentRatio')).toBe('60 %');
  });
  it('vacío para nulo/no finito', () => {
    expect(formatAxisValue(null, 'eur')).toBe('');
    expect(formatAxisValue(Number.NaN, 'eur')).toBe('');
  });
});

describe('formatDelta', () => {
  it('antepone + a positivos y − a negativos', () => {
    expect(formatDelta(12, 'percent')).toBe('+12 %');
    expect(formatDelta(-8.5, 'percent')).toBe('−8,5 %');
    expect(formatDelta(0, 'percent')).toBe('0 %');
  });
});

describe('átomos', () => {
  it('StatValue pinta el valor formateado', () => {
    render(<StatValue value={84560.09} format="eur" size="lg" />);
    expect(screen.getByText(/84\.560,09\s?€/)).toBeInTheDocument();
  });

  it('DeltaBadge: positivo → tono up; negativo → down; nulo → nada', () => {
    const { rerender, container } = render(<DeltaBadge delta={5} />);
    expect(container.querySelector('.dv-delta--up')).toBeInTheDocument();
    rerender(<DeltaBadge delta={-5} />);
    expect(container.querySelector('.dv-delta--down')).toBeInTheDocument();
    rerender(<DeltaBadge delta={null} />);
    expect(container.querySelector('.dv-delta')).toBeNull();
  });

  it('DeltaBadge invert: una bajada cuenta como buena (descuento/devolución)', () => {
    const { container } = render(<DeltaBadge delta={-3} invert />);
    expect(container.querySelector('.dv-delta--up')).toBeInTheDocument();
  });

  it('StatLabel, SectionHeader y TrendCaption renderizan su texto', () => {
    render(
      <>
        <StatLabel>Facturación</StatLabel>
        <SectionHeader title="Ventas del mes" subtitle="Todas las tiendas" />
        <TrendCaption text="+12% vs ayer" tone="up" />
      </>,
    );
    expect(screen.getByText('Facturación')).toBeInTheDocument();
    expect(screen.getByText('Ventas del mes')).toBeInTheDocument();
    expect(screen.getByText('Todas las tiendas')).toBeInTheDocument();
    expect(screen.getByText('+12% vs ayer')).toBeInTheDocument();
  });

  it('StatusPill aplica el tono semántico', () => {
    const { container } = render(<StatusPill label="Agotado" tone="danger" />);
    expect(container.querySelector('.dv-status-pill--danger')).toBeInTheDocument();
    expect(screen.getByText('Agotado')).toBeInTheDocument();
  });

  it('ChartLegend pinta un punto por serie con su color', () => {
    render(
      <ChartLegend
        items={[
          { label: 'Aceites', colorVar: '--ui-cat-1' },
          { label: 'CBD', colorVar: '--ui-cat-2' },
        ]}
      />,
    );
    expect(screen.getByText('Aceites')).toBeInTheDocument();
    expect(screen.getByText('CBD')).toBeInTheDocument();
  });

  it('MiniSparkline renderiza con datos', () => {
    const { container } = render(<MiniSparkline data={[1, 4, 2, 8, 5]} tone="success" />);
    expect(container.querySelector('.dv-mini-spark')).toBeInTheDocument();
  });

  it('WidgetStates: loading es status; error/empty muestran mensaje por defecto', () => {
    const { rerender } = render(<WidgetStates state="loading" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(<WidgetStates state="error" />);
    expect(screen.getByText('No se pudieron cargar los datos.')).toBeInTheDocument();
    rerender(<WidgetStates state="empty" />);
    expect(screen.getByText('Sin datos.')).toBeInTheDocument();
  });
});
