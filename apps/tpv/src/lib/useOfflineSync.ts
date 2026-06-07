import { useEffect, useSyncExternalStore } from 'react';

import { ensureTicketBlock, outboxCount, subscribeOutbox, syncOutbox } from './offline-sales.js';

// Orquesta la venta offline del TPV (offline slice 2c):
// - al montar/cambiar de tienda con conexión: sincroniza la cola y reserva/repone
//   el bloque de tickets para poder vender si se cae la red;
// - al volver la conexión ('online'): sincroniza la cola y repone el bloque;
// - expone el nº de ventas en cola (reactivo) para la UI.
export function useOfflineSync(storeId: string | null): number {
  const queued = useSyncExternalStore(subscribeOutbox, outboxCount, () => 0);

  useEffect(() => {
    if (!storeId) {
      return;
    }
    let cancelled = false;

    const refresh = async (): Promise<void> => {
      if (!navigator.onLine) {
        return;
      }
      await syncOutbox();
      if (!cancelled) {
        await ensureTicketBlock(storeId);
      }
    };

    void refresh();
    const onOnline = (): void => {
      void refresh();
    };
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [storeId]);

  return queued;
}
