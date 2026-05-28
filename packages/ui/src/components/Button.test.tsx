import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button.js';

describe('Button', () => {
  it('renderiza children', () => {
    render(<Button>Hola</Button>);
    expect(screen.getByRole('button', { name: 'Hola' })).toBeInTheDocument();
  });

  it('aplica clases del variant ghost', () => {
    render(<Button variant="ghost">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-transparent');
  });

  it('aplica className adicional sin sobrescribir base', () => {
    render(<Button className="extra-class">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('extra-class');
    expect(screen.getByRole('button')).toHaveClass('inline-flex');
  });
});
