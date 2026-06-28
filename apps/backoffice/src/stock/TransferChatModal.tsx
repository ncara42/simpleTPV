import { TransferChat } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  deleteTransferMessage,
  editTransferMessage,
  listTransferMessages,
  postTransferMessage,
  resolveTransferIncident,
} from '../lib/stock.js';

// Modal de chat del traspaso para el backoffice (lado 'central'). Carga el hilo, publica
// mensajes y —si hay una incidencia abierta— ofrece marcarla como solucionada desde un
// banner. La UI vive en el componente compartido @simpletpv/ui TransferChat.
interface TransferChatModalProps {
  transferId: string;
  title: string;
  subtitle?: string;
  /** Hay una incidencia abierta (sin resolver) → muestra el banner «¿Solucionado?». */
  incidentOpen: boolean;
  onClose: () => void;
}

export function TransferChatModal({
  transferId,
  title,
  subtitle,
  incidentOpen,
  onClose,
}: TransferChatModalProps) {
  const qc = useQueryClient();
  const [justResolved, setJustResolved] = useState(false);
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['transfer-messages', transferId],
    queryFn: () => listTransferMessages(transferId),
  });
  const send = useMutation({
    mutationFn: (input: { body?: string; dataUrl?: string }) =>
      postTransferMessage(transferId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transfer-messages', transferId] });
    },
  });
  const resolve = useMutation({
    mutationFn: () => resolveTransferIncident(transferId),
    onSuccess: () => {
      setJustResolved(true);
      void qc.invalidateQueries({ queryKey: ['transfers'] });
    },
  });
  const invalidateThread = () =>
    void qc.invalidateQueries({ queryKey: ['transfer-messages', transferId] });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      editTransferMessage(transferId, id, body),
    onSuccess: invalidateThread,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTransferMessage(transferId, id),
    onSuccess: invalidateThread,
  });

  const banner = justResolved ? (
    <div className="tc-banner tc-banner--done" data-testid="transfer-chat-resolved">
      Incidencia marcada como solucionada ✓
    </div>
  ) : incidentOpen ? (
    <div className="tc-banner">
      <span className="tc-banner__q">¿Ha sido solucionado este problema?</span>
      <button
        type="button"
        className="tc-banner__yes"
        onClick={() => resolve.mutate()}
        disabled={resolve.isPending}
        data-testid="transfer-chat-resolve"
      >
        Sí
      </button>
    </div>
  ) : undefined;

  return (
    <TransferChat
      open
      onClose={onClose}
      side="central"
      title={title}
      subtitle={subtitle}
      messages={messages}
      loading={isLoading}
      sending={send.isPending}
      onSend={(input) => send.mutate(input)}
      onEdit={(id, body) => edit.mutate({ id, body })}
      onDelete={(id) => remove.mutate(id)}
      banner={banner}
      testId="transfer-chat"
    />
  );
}
