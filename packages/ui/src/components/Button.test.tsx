import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button.js';

describe('Button', () => {
  it('renders a primary button by default', () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveClass('bg-[var(--ui-primary)]');
  });

  it('renders secondary and danger variants', () => {
    render(
      <>
        <Button variant="secondary">Cancelar</Button>
        <Button variant="danger">Eliminar</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass(
      'border-[var(--ui-border)]',
    );
    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveClass('bg-[var(--ui-danger)]');
  });

  it('U-14: pinta el icono (aria-hidden) junto al texto sin romper el nombre accesible', () => {
    render(<Button icon={<svg data-testid="cta-icon" />}>Nuevo producto</Button>);
    // El nombre accesible sigue siendo el texto (el icono es decorativo).
    const btn = screen.getByRole('button', { name: 'Nuevo producto' });
    expect(btn.querySelector('[data-testid="cta-icon"]')).not.toBeNull();
  });
});
