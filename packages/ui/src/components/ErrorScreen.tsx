/**
 * Fallback de Sentry.ErrorBoundary (#79). Sustituye la pantalla en blanco por un
 * mensaje amable cuando un error de render escapa. Mínimo, sin librerías nuevas.
 * Compartido por apps/tpv y apps/backoffice (idéntico en ambas).
 */
export function ErrorScreen() {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1rem',
        fontFamily: 'system-ui, sans-serif',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Algo ha fallado</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Ha ocurrido un error inesperado. Recarga la página para continuar.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{ padding: '0.5rem 1rem', fontSize: '1rem', cursor: 'pointer' }}
      >
        Recargar
      </button>
    </div>
  );
}
