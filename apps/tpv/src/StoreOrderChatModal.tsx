import { TransferChat } from '@simpletpv/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listStoreOrderMessages, postStoreOrderMessage } from './lib/store-orders.js';

// Chat del pedido/traspaso para el TPV (lado 'store', el dependiente). Misma UI que el
// backoffice vía el componente compartido @simpletpv/ui TransferChat.
interface StoreOrderChatModalProps {
  orderId: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export function StoreOrderChatModal({
  orderId,
  title,
  subtitle,
  onClose,
}: StoreOrderChatModalProps) {
  const qc = useQueryClient();
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
      testId="store-order-chat"
    />
  );
}
