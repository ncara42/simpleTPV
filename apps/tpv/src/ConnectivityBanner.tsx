import { type CSSProperties, useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

const bannerStyle = (bg: string): CSSProperties => ({
  background: bg,
  color: '#fff',
  padding: '6px 16px',
  fontSize: '14px',
  fontWeight: 600,
  textAlign: 'center',
});

// Indicador de conexión del TPV. Sin internet, muestra una banda naranja: la app
// sigue cargando (PWA app-shell), el catálogo se ve desde caché y las ventas se
// encolan (offline slice 2c). Con conexión pero con ventas en cola, muestra una
// banda azul de "pendientes de sincronizar".
export function ConnectivityBanner({ queuedCount = 0 }: { queuedCount?: number }) {
  const isOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // valor inicial (sin window): asumir con conexión
  );

  if (!isOnline) {
    const cola = queuedCount > 0 ? ` · ${queuedCount} venta(s) en cola` : '';
    return (
      <div data-testid="offline-banner" role="status" style={bannerStyle('#b45309')}>
        Sin conexión — modo offline. El catálogo se muestra desde caché{cola}.
      </div>
    );
  }

  if (queuedCount > 0) {
    return (
      <div data-testid="sync-banner" role="status" style={bannerStyle('#1d4ed8')}>
        Sincronizando {queuedCount} venta(s) pendiente(s)…
      </div>
    );
  }

  return null;
}
