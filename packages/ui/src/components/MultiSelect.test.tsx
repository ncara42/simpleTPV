import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MultiSelect } from './MultiSelect.js';
import type { SelectOption } from './Select.js';

const options: SelectOption[] = [
  { value: 'a', label: 'Tienda Norte' },
  { value: 'b', label: 'Tienda Sur' },
  { value: 'c', label: 'Tienda Centro', disabled: true },
];

function setup(values: string[] = [], extra: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  render(
    <MultiSelect
      values={values}
      onChange={onChange}
      options={options}
      placeholder="Todas las tiendas"
      ariaLabel="Tiendas"
      data-testid="ms"
      {...extra}
    />,
  );
  return { onChange };
}

describe('MultiSelect', () => {
  it('abre el menú por click y lo cierra al volver a pulsar', () => {
    setup();
    const trigger = screen.getByTestId('ms');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeVisible();
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('muestra el placeholder cuando no hay selección', () => {
    setup();
    expect(screen.getByText('Todas las tiendas')).toBeVisible();
  });

  it('togglear una opción emite onChange y NO cierra el menú', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTestId('ms'));
    fireEvent.click(screen.getByRole('option', { name: 'Tienda Sur' }));
    expect(onChange).toHaveBeenCalledWith(['b']);
    // El menú sigue abierto (selección múltiple).
    expect(screen.getByRole('listbox')).toBeVisible();
  });

  it('preserva el orden de options al añadir un segundo valor', () => {
    // Ya tiene 'b'; al marcar 'a' debe salir en orden de options: ['a','b'].
    const { onChange } = setup(['b']);
    fireEvent.click(screen.getByTestId('ms'));
    fireEvent.click(screen.getByRole('option', { name: 'Tienda Norte' }));
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('no togglea opciones disabled', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTestId('ms'));
    fireEvent.click(screen.getByRole('option', { name: 'Tienda Centro' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('pinta chips de las seleccionadas y permite quitarlas', () => {
    const { onChange } = setup(['a', 'b']);
    expect(screen.getByText('Tienda Norte')).toBeVisible();
    fireEvent.click(screen.getByTestId('ms-remove-a'));
    expect(onChange).toHaveBeenCalledWith(['b']);
  });

  it('la acción "Todas" limpia la selección', () => {
    const { onChange } = setup(['a', 'b']);
    fireEvent.click(screen.getByTestId('ms'));
    fireEvent.click(screen.getByTestId('ms-clear'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('deshabilitado no abre el menú', () => {
    setup([], { disabled: true });
    fireEvent.click(screen.getByTestId('ms'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('teclado: Espacio togglea la opción activa sin cerrar, Esc cierra', () => {
    const { onChange } = setup();
    const trigger = screen.getByTestId('ms');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // abre, activa la 1ª
    expect(screen.getByRole('listbox')).toBeVisible();
    fireEvent.keyDown(trigger, { key: ' ' });
    expect(onChange).toHaveBeenCalledWith(['a']);
    expect(screen.getByRole('listbox')).toBeVisible();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
