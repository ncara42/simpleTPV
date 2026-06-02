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
});
