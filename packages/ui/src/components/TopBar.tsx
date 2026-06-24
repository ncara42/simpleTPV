import { useCallback, useEffect, useRef, useState } from 'react';

import { initials } from '../lib/initials.js';

// Topbar flotante compartido por backoffice y TPV. Dos piezas:
//  · Isla central (pill): atrás · nombre de la vista (centrado) · tema · campana.
//  · Clúster derecho: acciones de la vista · búsqueda · cuenta.
// El tema vive en el atributo `data-theme` de <html> (+ localStorage); el script de
// arranque de cada index.html lo fija antes de pintar. Aquí solo se conmuta.

export interface TopBarAccount {
  name: string;
  subtitle?: string;
  onLogout?: () => void;
}

export interface TopBarProps {
  /** Botón atrás. Si se omite, no se pinta (apps sin historial). */
  onBack?: (() => void) | undefined;
  /** Nombre de la vista activa: centrado en la isla. */
  title: string;
  /** data-testid del título (hook de e2e, p. ej. `page-heading`). */
  titleTestId?: string | undefined;
  /** Campana de notificaciones (opcional). */
  onNotifications?: (() => void) | undefined;
  notificationCount?: number | undefined;
  notificationsActive?: boolean | undefined;
  /** Acciones de la vista activa (export/import…): clúster derecho, antes de la búsqueda. */
  pageActions?: React.ReactNode;
  /** Lanzador de búsqueda (⌘K): vive DENTRO de la isla (barra de navegación). */
  search?: React.ReactNode;
  /** Slot extra al final del clúster derecho (p. ej. conmutador de modo del dashboard). */
  endSlot?: React.ReactNode;
  /** Cuenta: botón con menú (cerrar sesión) en el extremo derecho. */
  account?: TopBarAccount | undefined;
}

function BackGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function BellGlyph() {
  return (
    <svg
      width="18"
      height="18"
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

function LogoutGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function AccountMenu({ account }: { account: TopBarAccount }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="topbar-account" ref={rootRef}>
      <button
        type="button"
        className={`topbar-account-btn${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={account.name}
        data-testid="account-menu"
      >
        <span className="topbar-account-avatar" aria-hidden="true">
          {initials(account.name)}
        </span>
        <span className="topbar-account-meta">
          <span className="topbar-account-name">{account.name}</span>
          {account.subtitle && <span className="topbar-account-sub">{account.subtitle}</span>}
        </span>
      </button>
      {open && (
        <div className="topbar-account-panel" role="menu" aria-label="Cuenta">
          {account.onLogout && (
            <button
              type="button"
              className="topbar-account-item topbar-account-item--danger"
              role="menuitem"
              onClick={() => {
                close();
                account.onLogout?.();
              }}
              data-testid="logout"
            >
              <span className="topbar-account-item-icon">
                <LogoutGlyph />
              </span>
              <span>Cerrar sesión</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar({
  onBack,
  title,
  titleTestId,
  onNotifications,
  notificationCount = 0,
  notificationsActive = false,
  pageActions,
  search,
  endSlot,
  account,
}: TopBarProps) {
  return (
    <header className="topbar" data-testid="topbar">
      {/* Isla central: atrás · título (centrado) · tema · campana. */}
      <div className="topbar-island">
        {onBack && (
          <button
            type="button"
            className="topbar-icon-btn topbar-island-back"
            onClick={onBack}
            aria-label="Volver"
            title="Volver"
            data-testid="topbar-back"
          >
            <BackGlyph />
          </button>
        )}
        <h1 className="topbar-title" data-testid={titleTestId} title={title}>
          {title}
        </h1>
        {search && <div className="topbar-island-actions">{search}</div>}
      </div>

      {/* Clúster derecho: acciones de vista · campana · conmutador de modo · cuenta. */}
      {(pageActions || onNotifications || endSlot || account) && (
        <div className="topbar-right">
          {pageActions && <div className="topbar-page-actions">{pageActions}</div>}
          {onNotifications && (
            <button
              type="button"
              className={`topbar-icon-btn${notificationsActive ? ' is-active' : ''}`}
              onClick={onNotifications}
              aria-label={
                notificationCount > 0
                  ? `Notificaciones (${notificationCount} sin leer)`
                  : 'Notificaciones'
              }
              aria-pressed={notificationsActive}
              title="Notificaciones"
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
          {endSlot}
          {account && <AccountMenu account={account} />}
        </div>
      )}
    </header>
  );
}
