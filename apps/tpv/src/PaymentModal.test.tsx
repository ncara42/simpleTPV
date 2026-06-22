import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type PaymentData, PaymentModal } from './PaymentModal.js';

function setup(overrides: Partial<React.ComponentProps<typeof PaymentModal>> = {}) {
  const onConfirm = vi.fn<(p: PaymentData) => void>();
  render(
    <PaymentModal
      total={10}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
      busy={false}
      {...overrides}
    />,
  );
  return { onConfirm };
}

describe('PaymentModal — factura completa F1', () => {
  it('cobra como ticket (F2) sin datos de cliente por defecto', () => {
    const { onConfirm } = setup();
    // Tarjeta para no exigir efectivo entregado.
    fireEvent.click(screen.getByTestId('pay-card'));
    fireEvent.click(screen.getByTestId('pay-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const payload = onConfirm.mock.lastCall?.[0];
    expect(payload).toBeDefined();
    expect(payload).not.toHaveProperty('customerTaxId');
    expect(payload).not.toHaveProperty('customerName');
  });

  it('incluye NIF + razón social cuando se pide factura', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByTestId('pay-card'));
    fireEvent.click(screen.getByTestId('pay-invoice-toggle'));
    fireEvent.change(screen.getByTestId('invoice-tax-id'), { target: { value: ' B11111111 ' } });
    fireEvent.change(screen.getByTestId('invoice-name'), {
      target: { value: ' Cliente SL ' },
    });
    fireEvent.click(screen.getByTestId('pay-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: 'CARD',
        customerTaxId: 'B11111111', // trimmed
        customerName: 'Cliente SL',
      }),
    );
  });

  it('bloquea el cobro si se pide factura pero falta la razón social', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByTestId('pay-card'));
    fireEvent.click(screen.getByTestId('pay-invoice-toggle'));
    fireEvent.change(screen.getByTestId('invoice-tax-id'), { target: { value: 'B11111111' } });
    // Sin nombre → confirmar deshabilitado (no se envía NIF suelto al backend).
    expect(screen.getByTestId('pay-confirm')).toBeDisabled();
    fireEvent.click(screen.getByTestId('pay-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
