import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

// Indicador de conexión del TPV. Muestra una banda cuando el terminal pierde
// internet. La app sigue cargando (PWA app-shell) y el catálogo se ve desde la
// caché de TanStack Query; la venta offline (cola + sync) llega en la slice 2.
export function ConnectivityBanner() {
  const isOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // valor inicial (sin window): asumir con conexión
  );

  if (isOnline) {
    return null;
  }

  return (
    <div
      data-testid="offline-banner"
      role="status"
      style={{
        background: '#b45309',
        color: '#fff',
        padding: '6px 16px',
        fontSize: '14px',
        fontWeight: 600,
        textAlign: 'center',
      }}
    >
      Sin conexión — modo offline. El catálogo se muestra desde caché.
    </div>
  );
}
