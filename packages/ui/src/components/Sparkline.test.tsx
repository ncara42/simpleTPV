import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sparkline } from './Sparkline.js';

describe('Sparkline', () => {
  it('dibuja un punto por valor (polyline + área) con 2 o más puntos', () => {
    const { container } = render(<Sparkline data={[1, 5, 3, 8]} data-testid="spark" />);
    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
    expect(polyline!.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(4);
    // El área cierra hasta la base (línea final del path Z).
    expect(container.querySelector('path.ui-spark-area')).not.toBeNull();
  });

  it('no dibuja nada con menos de 2 puntos', () => {
    const { container } = render(<Sparkline data={[42]} />);
    expect(container.firstChild).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('aplica la clase de tono', () => {
    const { container } = render(<Sparkline data={[1, 2]} tone="down" data-testid="spark" />);
    const svg = container.querySelector('svg')!;
    expect(svg.classList.contains('ui-spark-down')).toBe(true);
  });

  it('es decorativo (aria-hidden) sin ariaLabel', () => {
    render(<Sparkline data={[1, 2, 3]} data-testid="spark" />);
    expect(screen.getByTestId('spark')).toHaveAttribute('aria-hidden', 'true');
  });

  it('expone role="img" con nombre accesible cuando se aporta ariaLabel', () => {
    render(<Sparkline data={[1, 2, 3]} ariaLabel="Tendencia de ventas" />);
    expect(screen.getByRole('img', { name: 'Tendencia de ventas' })).toBeInTheDocument();
  });

  it('respeta el alto indicado', () => {
    render(<Sparkline data={[1, 2]} height={60} data-testid="spark" />);
    expect(screen.getByTestId('spark')).toHaveStyle({ height: '60px' });
  });
});
