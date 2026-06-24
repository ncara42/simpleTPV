export interface TopBarProps {
  /**
   * Etiqueta de contexto persistente (área de la app o tienda activa). NO es el
   * título de la página: cada vista es dueña de su propio título en el contenido,
   * así no se duplica. Ver topbar.css (.topbar-eyebrow).
   */
  eyebrow?: string;
  /**
   * Título de la barra. El backoffice lo usa para reflejar el título de la vista
   * activa (junto a `subtitle`) y así liberar espacio en el contenido. Otras apps
   * pueden omitirlo si prefieren que el título viva en la cabecera de la vista.
   */
  title?: string;
  /**
   * Descripción/subtítulo bajo el título (p. ej. «12 productos activos»). Solo se
   * pinta si hay `title`. Acompaña a la cabecera informativa del backoffice.
   */
  subtitle?: string | undefined;
  /** data-testid opcional para el subtítulo (preserva hooks de e2e como `catalog-count`). */
  subtitleTestId?: string | undefined;
  /** data-testid opcional para el título (preserva hooks de e2e como `page-heading`). */
  titleTestId?: string | undefined;
  /**
   * Slot de búsqueda. Vive en la zona derecha de la barra, entre la campana y el
   * conmutador de app; el título de la vista ocupa la zona izquierda.
   */
  search?: React.ReactNode;
  /** Slot de acciones extra en la zona derecha (p. ej. el toggle de tema claro/oscuro). */
  actions?: React.ReactNode;
  activeApp?: 'backoffice' | 'tpv';
  onSwitchApp?: (app: 'backoffice' | 'tpv') => void;
  /** Si se define, pinta la campana de notificaciones a la izquierda del conmutador. */
  onNotifications?: () => void;
  /** Nº de notificaciones sin leer; se muestra como badge sobre la campana si > 0. */
  notificationCount?: number;
  /** Marca la campana como activa (la vista de notificaciones está abierta). */
  notificationsActive?: boolean;
}

// La campana togglea el panel: el aria-label refleja la acción ("Abrir"/"Cerrar")
// y conserva el conteo de no leídas como contexto para lectores de pantalla.
function notificationsAriaLabel(active: boolean, count: number): string {
  const verb = active ? 'Cerrar notificaciones' : 'Abrir notificaciones';
  return count > 0 ? `${verb} (${count} sin leer)` : verb;
}

function BellGlyph() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function TopBar({
  eyebrow,
  title,
  subtitle,
  subtitleTestId,
  titleTestId,
  search,
  actions,
  activeApp = 'tpv',
  onSwitchApp,
  onNotifications,
  notificationCount = 0,
  notificationsActive = false,
}: TopBarProps) {
  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar-left">
        {eyebrow && <span className="topbar-eyebrow">{eyebrow}</span>}
        {title && (
          <h1 className="topbar-title" data-testid={titleTestId} title={title}>
            {title}
          </h1>
        )}
        {title && subtitle && (
          <p className="topbar-subtitle" data-testid={subtitleTestId} title={subtitle}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="topbar-right">
        {onNotifications && (
          <button
            type="button"
            className={`topbar-notif${notificationsActive ? ' active' : ''}`}
            onClick={onNotifications}
            aria-label={notificationsAriaLabel(notificationsActive, notificationCount)}
            aria-pressed={notificationsActive}
            title={notificationsActive ? 'Cerrar notificaciones' : 'Notificaciones'}
            data-testid="topbar-notifications"
          >
            <BellGlyph />
            {notificationCount > 0 && (
              <span className="topbar-notif-badge" data-testid="topbar-notifications-badge">
                {notificationCount}
              </span>
            )}
          </button>
        )}
        {search}
        {actions}
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
