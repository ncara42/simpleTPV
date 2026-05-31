import { useCallback, useEffect, useState } from 'react';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  group?: string;
}

export interface NavGroup {
  id: string;
  label: string;
}

export interface SidebarProps {
  items: NavItem[];
  groups?: NavGroup[];
  activeItem: string;
  onSelect: (id: string) => void;
  user?: { name: string; email: string };
  onLogout?: () => void;
  logo?: React.ReactNode;
  statusBadge?: React.ReactNode;
}

const PINNED_KEY = 'simpletpv-sidebar-pinned';

export function Sidebar({
  items,
  groups,
  activeItem,
  onSelect,
  user,
  onLogout,
  logo,
  statusBadge,
}: SidebarProps) {
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem(PINNED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const expanded = pinned || hovered;

  // Notificar al shell el ancho actual
  useEffect(() => {
    const width = expanded ? 'var(--sidebar-width-expanded)' : 'var(--sidebar-width-rail)';
    document.documentElement.style.setProperty('--sidebar-current-width', width);
  }, [expanded]);

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PINNED_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
      setMobileOpen(false);
    },
    [onSelect],
  );

  const renderItems = (filterGroup?: string) =>
    items
      .filter((item) => item.group === filterGroup)
      .map((item) => (
        <li key={item.id}>
          <button
            className={`sidebar-item${activeItem === item.id ? ' active' : ''}`}
            onClick={() => handleSelect(item.id)}
            title={item.label}
            data-testid={`nav-${item.id}`}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            <span className="sidebar-item-label">{item.label}</span>
          </button>
        </li>
      ));

  const sidebarClass = ['sidebar', expanded ? 'expanded' : '', mobileOpen ? 'mobile-open' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {/* Overlay móvil */}
      <div
        className={`sidebar-overlay${mobileOpen ? ' visible' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={sidebarClass}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Header */}
        <div className="sidebar-header">
          <button
            className="sidebar-logo-btn"
            onClick={togglePin}
            title={pinned ? 'Colapsar sidebar' : 'Fijar sidebar'}
            aria-label={pinned ? 'Colapsar sidebar' : 'Fijar sidebar'}
          >
            {logo ?? 'S'}
          </button>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {groups && groups.length > 0 ? (
            <>
              {/* Items sin grupo (ej: Dashboard) */}
              <ul className="sidebar-group-items">{renderItems(undefined)}</ul>

              {/* Grupos */}
              {groups.map((group) => {
                const isCollapsed = !!collapsedGroups[group.id];
                return (
                  <div key={group.id}>
                    <button
                      className="sidebar-group-header"
                      onClick={() => toggleGroup(group.id)}
                      title={group.label}
                    >
                      <span>{group.label}</span>
                      <span>{isCollapsed ? '▸' : '▾'}</span>
                    </button>
                    <ul className={`sidebar-group-items${isCollapsed ? ' collapsed' : ''}`}>
                      {renderItems(group.id)}
                    </ul>
                  </div>
                );
              })}
            </>
          ) : (
            <ul className="sidebar-group-items">{renderItems(undefined)}</ul>
          )}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          {statusBadge}
          {user && (
            <button
              className="sidebar-item"
              disabled
              style={{ cursor: 'default', opacity: 0.7 }}
              title={user.email}
            >
              <span className="sidebar-item-icon" aria-hidden="true">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </span>
              <span className="sidebar-item-label">{user.name || user.email}</span>
            </button>
          )}
          {onLogout && (
            <button
              className="sidebar-item"
              onClick={onLogout}
              title="Cerrar sesión"
              data-testid="logout"
            >
              <span className="sidebar-item-icon" aria-hidden="true">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </span>
              <span className="sidebar-item-label">Cerrar sesión</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
