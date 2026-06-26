import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Tooltip } from './Tooltip.js';

const OPEN_DELAY = 350;

function renderTooltip(props: Partial<React.ComponentProps<typeof Tooltip>> = {}) {
  return render(
    <Tooltip label="Asistente de IA" {...props}>
      <button type="button">Trigger</button>
    </Tooltip>,
  );
}

describe('Tooltip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('aparece al hacer hover tras el retardo y muestra solo la etiqueta', () => {
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull(); // aún no: hay retardo

    act(() => vi.advanceTimersByTime(OPEN_DELAY));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Asistente de IA');
    expect(trigger).toHaveAttribute('aria-describedby', tip.id);
  });

  it('se cierra al salir el ratón', () => {
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.mouseEnter(trigger);
    act(() => vi.advanceTimersByTime(OPEN_DELAY));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });

  it('aparece con el foco de teclado y se cierra con Escape', () => {
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.focus(trigger);
    act(() => vi.advanceTimersByTime(OPEN_DELAY));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('cancela la apertura si el ratón sale antes del retardo', () => {
    renderTooltip();
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    act(() => vi.advanceTimersByTime(OPEN_DELAY));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('con disabled no monta tooltip y deja pasar el hijo', () => {
    renderTooltip({ disabled: true });
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.mouseEnter(trigger);
    act(() => vi.advanceTimersByTime(OPEN_DELAY));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });
});
