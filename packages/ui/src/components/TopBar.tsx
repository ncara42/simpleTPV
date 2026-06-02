export interface TopBarProps {
  eyebrow?: string;
  title: string;
  activeApp?: 'backoffice' | 'tpv';
  onSwitchApp?: (app: 'backoffice' | 'tpv') => void;
  onLogout?: () => void;
}

export function TopBar({ eyebrow, title, activeApp = 'tpv', onSwitchApp, onLogout }: TopBarProps) {
  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar-left">
        {eyebrow && <span className="topbar-eyebrow">{eyebrow}</span>}
        <h1 className="topbar-title">{title}</h1>
      </div>
      <div className="topbar-right">
        <div className="topbar-switch" role="group" aria-label="Cambiar de app">
          <button
            type="button"
            className={`topbar-switch-btn${activeApp === 'backoffice' ? ' active' : ''}`}
            onClick={() => onSwitchApp?.('backoffice')}
            data-testid="switch-backoffice"
          >
            Backoffice
          </button>
          <button
            type="button"
            className={`topbar-switch-btn${activeApp === 'tpv' ? ' active' : ''}`}
            onClick={() => onSwitchApp?.('tpv')}
            data-testid="switch-tpv"
          >
            TPV
          </button>
        </div>
        {onLogout && (
          <button type="button" className="topbar-logout" onClick={onLogout} data-testid="logout">
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
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Salir
          </button>
        )}
      </div>
    </header>
  );
}
