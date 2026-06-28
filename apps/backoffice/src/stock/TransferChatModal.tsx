import { TransferChat } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listTransferMessages, postTransferMessage } from '../lib/stock.js';

// Modal de chat del traspaso para el backoffice (lado 'central'). Carga el hilo y publica
// mensajes; toda la UI vive en el componente compartido @simpletpv/ui TransferChat.
interface TransferChatModalProps {
  transferId: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export function TransferChatModal({
  transferId,
  title,
  subtitle,
  onClose,
}: TransferChatModalProps) {
  const qc = useQueryClient();
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
      testId="transfer-chat"
    />
  );
}
