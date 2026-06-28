import { TransferChat } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  deleteStoreOrderMessage,
  editStoreOrderMessage,
  listStoreOrderMessages,
  postStoreOrderMessage,
  resolveStoreOrderIncident,
} from './lib/store-orders.js';

// Chat del pedido/traspaso para el TPV (lado 'store', el dependiente). Misma UI que el
// backoffice vía el componente compartido TransferChat; si hay incidencia abierta, el
// banner permite marcarla como solucionada.
interface StoreOrderChatModalProps {
  orderId: string;
  title: string;
  subtitle?: string;
  incidentOpen: boolean;
  onClose: () => void;
}

export function StoreOrderChatModal({
  orderId,
  title,
  subtitle,
  incidentOpen,
  onClose,
}: StoreOrderChatModalProps) {
  const qc = useQueryClient();
  const [justResolved, setJustResolved] = useState(false);
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['store-order-messages', orderId],
    queryFn: () => listStoreOrderMessages(orderId),
  });
  const send = useMutation({
    mutationFn: (input: { body?: string; dataUrl?: string }) =>
      postStoreOrderMessage(orderId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['store-order-messages', orderId] });
    },
  });
  const resolve = useMutation({
    mutationFn: () => resolveStoreOrderIncident(orderId),
    onSuccess: () => {
      setJustResolved(true);
      void qc.invalidateQueries({ queryKey: ['incoming-store-orders'] });
    },
  });
  const invalidateThread = () =>
    void qc.invalidateQueries({ queryKey: ['store-order-messages', orderId] });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      editStoreOrderMessage(orderId, id, body),
    onSuccess: invalidateThread,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteStoreOrderMessage(orderId, id),
    onSuccess: invalidateThread,
  });

  const banner = justResolved ? (
    <div className="tc-banner tc-banner--done">Incidencia marcada como solucionada ✓</div>
  ) : incidentOpen ? (
    <div className="tc-banner">
      <span className="tc-banner__q">¿Ha sido solucionado este problema?</span>
      <button
        type="button"
        className="tc-banner__yes"
        onClick={() => resolve.mutate()}
        disabled={resolve.isPending}
        data-testid="store-order-resolve"
      >
        Sí
      </button>
    </div>
  ) : undefined;

  return (
    <TransferChat
      open
      onClose={onClose}
      side="store"
      title={title}
      subtitle={subtitle}
      messages={messages}
      loading={isLoading}
      sending={send.isPending}
      onSend={(input) => send.mutate(input)}
      onEdit={(id, body) => edit.mutate({ id, body })}
      onDelete={(id) => remove.mutate(id)}
      banner={banner}
      testId="store-order-chat"
    />
  );
}
