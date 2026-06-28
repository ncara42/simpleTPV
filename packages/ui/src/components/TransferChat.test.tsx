import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TransferChat, type TransferChatMessage } from './TransferChat.js';

const MSGS: TransferChatMessage[] = [
  {
    id: '1',
    author: 'store',
    body: 'Falta una unidad',
    dataUrl: null,
    createdAt: '2026-06-22T09:05:00.000Z',
  },
  {
    id: '2',
    author: 'central',
    body: 'Vale, gracias',
    dataUrl: null,
    createdAt: '2026-06-22T09:18:00.000Z',
  },
];

describe('TransferChat', () => {
  it('no renderiza nada cuando open=false', () => {
    const { container } = render(
      <TransferChat
        open={false}
        onClose={() => {}}
        side="central"
        messages={[]}
        onSend={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('alinea los mensajes propios a la derecha y los del otro lado a la izquierda', () => {
    render(
      <TransferChat open onClose={() => {}} side="central" messages={MSGS} onSend={() => {}} />,
    );
    const msgs = screen.getAllByTestId('tc-message');
    // Vista 'central': el mensaje 'store' es del otro lado (peer); el 'central', propio.
    expect(msgs[0]!.className).toContain('tc-msg--peer');
    expect(msgs[1]!.className).toContain('tc-msg--own');
  });

  it('envía el texto con Enter llamando a onSend', () => {
    const onSend = vi.fn();
    render(<TransferChat open onClose={() => {}} side="store" messages={[]} onSend={onSend} />);
    const input = screen.getByTestId('tc-input');
    fireEvent.change(input, { target: { value: 'Hola central' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith({ body: 'Hola central' });
  });

  it('muestra el estado vacío cuando no hay mensajes', () => {
    render(
      <TransferChat
        open
        onClose={() => {}}
        side="store"
        messages={[]}
        onSend={() => {}}
        emptyHint="Sin mensajes aún."
      />,
    );
    expect(screen.getByText('Sin mensajes aún.')).toBeInTheDocument();
  });
});
