export interface TopBarProps {
  /**
   * Etiqueta de contexto persistente (área de la app o tienda activa). NO es el
   * título de la página: cada vista es dueña de su propio título en el contenido,
   * así no se duplica. Ver topbar.css (.topbar-eyebrow).
   */
  eyebrow?: string;
  /**
   * Título opcional. Por defecto las apps NO lo pasan: el título vive una sola
   * vez en la cabecera de la propia vista. Disponible para consumidores que sí
   * quieran un título en la barra.
   */
  title?: string;
  activeApp?: 'backoffice' | 'tpv';
  onSwitchApp?: (app: 'backoffice' | 'tpv') => void;
}

export function TopBar({ eyebrow, title, activeApp = 'tpv', onSwitchApp }: TopBarProps) {
  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar-left">
        {eyebrow && <span className="topbar-eyebrow">{eyebrow}</span>}
        {title && (
          <h1 className="topbar-title" title={title}>
            {title}
          </h1>
        )}
      </div>
      <div className="topbar-right">
        <div className="topbar-switch" role="group" aria-label="Cambiar de app">
          <button
            type="button"
            className={`topbar-switch-btn${activeApp === 'backoffice' ? ' active' : ''}`}
            aria-pressed={activeApp === 'backoffice'}
            onClick={() => onSwitchApp?.('backoffice')}
            data-testid="switch-backoffice"
          >
            Backoffice
          </button>
          <button
            type="button"
            className={`topbar-switch-btn${activeApp === 'tpv' ? ' active' : ''}`}
            aria-pressed={activeApp === 'tpv'}
            onClick={() => onSwitchApp?.('tpv')}
            data-testid="switch-tpv"
          >
            TPV
          </button>
        </div>
      </div>
    </header>
  );
}
