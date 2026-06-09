import { useCallback, useEffect, useRef, useState } from 'react';

import { initials } from '../lib/initials.js';

// Variantes de la micro-animación del icono al hacer hover (definidas como
// @keyframes en sidebar.css). Se reparten ciclando por la posición del item:
// así dos vecinos nunca repiten gesto y las cuatro salen equilibradas (un hash
// del id agrupaba demasiado con pocas entradas).
const ICON_ANIMS = ['sidebar-icon-hop', 'sidebar-icon-wiggle', 'sidebar-icon-pulse'] as const;

function iconAnimAt(index: number): string {
  return ICON_ANIMS[index % ICON_ANIMS.length] ?? ICON_ANIMS[0];
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  group?: string;
  /** Contador opcional (p. ej. notificaciones sin leer) pintado a la derecha del item. */
  badge?: number;
  /** Texto opcional (p. ej. temporizador del fichaje en vivo) como píldora a la derecha. */
  counter?: string;
}

export interface NavGroup {
  id: string;
  label: string;
}

interface SidebarAccount {
  name: string;
  subtitle?: string;
}

export interface SidebarProps {
  items: NavItem[];
  groups?: NavGroup[];
  activeItem: string;
  onSelect: (id: string) => void;
  onLogout?: () => void;
  logo?: React.ReactNode;
  brand?: { title: string; subtitle?: string };
  /** Cuenta en el pie (estilo ChatGPT): avatar + nombre + rol. */
  account?: SidebarAccount;
}

function LogoutGlyph() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </svg>
  );
}

export function Sidebar({
  items,
  groups,
  activeItem,
  onSelect,
  onLogout,
  logo,
  brand,
  account,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Cerrar el menú de cuenta al hacer click fuera o pulsar Escape (patrón de Select).
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
        accountTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Al abrir, llevar el foco al primer item del menú (navegación por teclado).
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [menuOpen]);

  // Navegación con flechas entre items del menú de cuenta.
  const onMenuKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const itemsEls = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (itemsEls.length === 0) return;
    const current = itemsEls.indexOf(document.activeElement as HTMLButtonElement);
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    const next = (current + dir + itemsEls.length) % itemsEls.length;
    itemsEls[next]?.focus();
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
      .map((item, index) => {
        const isActive = activeItem === item.id;
        return (
          <li key={item.id}>
            <button
              type="button"
              className={`sidebar-item${isActive ? ' active' : ''}`}
              onClick={() => handleSelect(item.id)}
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
              data-testid={`nav-${item.id}`}
            >
              <span
                className="sidebar-item-icon"
                style={{ '--sidebar-icon-anim': iconAnimAt(index) } as React.CSSProperties}
              >
                {item.icon}
              </span>
              <span className="sidebar-item-label">{item.label}</span>
              {item.counter && (
                <span className="sidebar-item-counter" data-testid={`nav-${item.id}-counter`}>
                  {item.counter}
                </span>
              )}
              {item.badge != null && item.badge > 0 && (
                <span className="sidebar-item-badge" data-testid={`nav-${item.id}-badge`}>
                  {item.badge}
                </span>
              )}
            </button>
          </li>
        );
      });

  return (
    <>
      <div
        className={`sidebar-overlay${mobileOpen ? ' visible' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}>
        {/* Header: logotipo (+ marca opcional) */}
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
        <nav className="sidebar-nav" aria-label="Navegación principal">
          <ul className="sidebar-group-items">{renderItems(undefined)}</ul>
          {groups?.map((group) => {
            const isCollapsed = !!collapsedGroups[group.id];
            return (
              <div key={group.id} className="sidebar-group">
                <button
                  type="button"
                  className={`sidebar-group-header${isCollapsed ? '' : ' expanded'}`}
                  onClick={() => toggleGroup(group.id)}
                  title={group.label}
                  aria-expanded={!isCollapsed}
                >
                  <span className="sidebar-group-label">{group.label}</span>
                  <svg
                    className="sidebar-group-chevron"
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <ul className={`sidebar-group-items${isCollapsed ? ' collapsed' : ''}`}>
                  {renderItems(group.id)}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Footer: cuenta (estilo ChatGPT) o cierre de sesión simple */}
        {account ? (
          <div className="sidebar-footer" ref={accountRef}>
            {onLogout && menuOpen && (
              <div
                className="sidebar-account-menu"
                role="menu"
                aria-label="Cuenta"
                ref={menuRef}
                onKeyDown={onMenuKeyDown}
              >
                <button
                  type="button"
                  className="sidebar-account-menu-item"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onLogout();
                  }}
                  data-testid="logout"
                >
                  <span className="sidebar-account-menu-icon">
                    <LogoutGlyph />
                  </span>
                  <span>Cerrar sesión</span>
                </button>
              </div>
            )}
            <button
              type="button"
              className={`sidebar-account${menuOpen ? ' open' : ''}`}
              ref={accountTriggerRef}
              onClick={() => setMenuOpen((v) => !v)}
              data-testid="account-menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={account.name}
            >
              <span className="sidebar-account-avatar" aria-hidden="true">
                {initials(account.name)}
              </span>
              <span className="sidebar-account-meta">
                <span className="sidebar-account-name">{account.name}</span>
                {account.subtitle && (
                  <span className="sidebar-account-sub">{account.subtitle}</span>
                )}
              </span>
            </button>
          </div>
        ) : (
          onLogout && (
            <div className="sidebar-footer">
              <button
                type="button"
                className="sidebar-logout"
                onClick={onLogout}
                data-testid="logout"
              >
                <span className="sidebar-item-icon">
                  <LogoutGlyph />
                </span>
                <span className="sidebar-item-label">Salir</span>
              </button>
            </div>
          )
        )}
      </aside>
    </>
  );
}
