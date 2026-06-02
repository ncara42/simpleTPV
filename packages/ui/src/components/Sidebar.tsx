import { useCallback, useState } from 'react';

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
  user?: { name: string; subtitle?: string };
  logo?: React.ReactNode;
  brand?: { title: string; subtitle?: string };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
}

export function Sidebar({ items, groups, activeItem, onSelect, user, logo, brand }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

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

  return (
    <>
      <div
        className={`sidebar-overlay${mobileOpen ? ' visible' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}>
        {/* Header: logo + marca */}
        <div className="sidebar-header">
          <span className="sidebar-logo">{logo ?? 'S'}</span>
          {brand && (
            <span className="sidebar-brand">
              <span className="sidebar-brand-title">{brand.title}</span>
              {brand.subtitle && <span className="sidebar-brand-sub">{brand.subtitle}</span>}
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {groups && groups.length > 0 ? (
            <>
              <ul className="sidebar-group-items">{renderItems(undefined)}</ul>
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

        {/* Footer: bloque de usuario */}
        {user && (
          <div className="sidebar-footer">
            <div className="sidebar-user" data-testid="sidebar-user">
              <span className="sidebar-avatar">{initials(user.name)}</span>
              <span className="sidebar-user-text">
                <span className="sidebar-user-name">{user.name}</span>
                {user.subtitle && <span className="sidebar-user-sub">{user.subtitle}</span>}
              </span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
