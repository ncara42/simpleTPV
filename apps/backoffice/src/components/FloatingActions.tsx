import { ArrowLeft, Bell, Home, Moon, Sun } from 'lucide-react';
import { useState } from 'react';

import type { Tab } from '../lib/nav.js';
import { usePageActionsValue } from '../lib/pageActions.js';
import { getTheme, type Theme, toggleTheme } from '../lib/theme.js';
import { FunctionSearch } from './FunctionSearch.js';

interface FloatingActionsProps {
  /** Navega a una view del backoffice (lo usa el buscador de funciones). */
  onNavigate: (tab: Tab) => void;
  /** Botón atrás → vuelve a la vista anterior del historial del router (S-03). */
  onBack: () => void;
  /** Botón home → Dashboard. */
  onHome: () => void;
  /** Campana de notificaciones (togglea la view de Notificaciones). */
  onNotifications: () => void;
  notificationCount: number;
  notificationsActive: boolean;
}

// Clúster de acciones flotante sobre el sidebar (sustituye al header/TopBar): lupa de funciones
// (⌘K) + botón home + campana de notificaciones + acciones de la vista activa (export/import…).
// El cambio a TPV ya NO vive aquí: es la última entrada del sidebar (appSwitch). Todo en una fila
// de pills/botones redondos a la altura del logo del sidebar flotante.
export function FloatingActions({
  onNavigate,
  onBack,
  onHome,
  onNotifications,
  notificationCount,
  notificationsActive,
}: FloatingActionsProps) {
  const pageActions = usePageActionsValue();
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  return (
    <div className="float-actions" data-testid="float-actions">
      <FunctionSearch onNavigate={onNavigate} />
      {/* Botón atrás (S-03): vuelve en el historial del router. Sustituye a la banda de
          breadcrumbs del plan original (jerarquía plana sin TopBar → migas de bajo valor). */}
      <button
        type="button"
        className="float-action-btn"
        onClick={onBack}
        aria-label="Volver"
        title="Volver"
        data-testid="float-back"
      >
        <ArrowLeft size={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="float-action-btn"
        onClick={onHome}
        aria-label="Ir al dashboard"
        title="Dashboard"
        data-testid="float-home"
      >
        <Home size={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="float-action-btn"
        onClick={() => setThemeState(toggleTheme())}
        aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        data-testid="float-theme-toggle"
      >
        {theme === 'dark' ? (
          <Sun size={17} aria-hidden="true" />
        ) : (
          <Moon size={17} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className={`float-action-btn${notificationsActive ? ' is-active' : ''}`}
        onClick={onNotifications}
        aria-label={
          notificationCount > 0
            ? `Notificaciones (${notificationCount} sin leer)`
            : 'Notificaciones'
        }
        aria-pressed={notificationsActive}
        title="Notificaciones"
        data-testid="float-notifications"
      >
        <Bell size={17} aria-hidden="true" />
        {notificationCount > 0 && (
          <span className="float-action-badge" data-testid="float-notifications-badge">
            {notificationCount}
          </span>
        )}
      </button>
      {/* Acciones de la vista activa (export/import…): se anclan al borde derecho del
          clúster (margin-left:auto), donde antes vivía el conmutador Backoffice↔TPV. */}
      <div className="float-page-actions">{pageActions}</div>
    </div>
  );
}
