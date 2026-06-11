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
  /** Icono del grupo (solo se pinta en el modo dropdown). */
  icon?: React.ReactNode;
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
  /**
   * Modo dropdown (D-02): los grupos se pliegan a una sola entrada y su contenido
   * se despliega inline al mantener el hover >200ms (preview) o al hacer CLIC,
   * que lo deja ANCLADO hasta clic-fuera/Escape. Solo un grupo abierto a la vez.
   * Los items sin grupo se renderizan como entradas directas en su posición.
   */
  groupsAsDropdowns?: boolean;
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
  groupsAsDropdowns = false,
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

  // ─── Modo dropdown (D-02): un grupo abierto, preview por hover, anclaje por clic ──
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [anchored, setAnchored] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const clearTimers = useCallback(() => {
    if (hoverTimer.current != null) window.clearTimeout(hoverTimer.current);
    if (leaveTimer.current != null) window.clearTimeout(leaveTimer.current);
    hoverTimer.current = null;
    leaveTimer.current = null;
  }, []);

  const closeDropdown = useCallback(() => {
    clearTimers();
    setOpenGroup(null);
    setAnchored(false);
  }, [clearTimers]);

  // Hover sostenido >200ms abre el preview (sin anclar). El anclado no se pisa.
  const onGroupEnter = useCallback(
    (groupId: string) => {
      if (!groupsAsDropdowns) return;
      clearTimers();
      if (anchored) return;
      hoverTimer.current = window.setTimeout(() => {
        setOpenGroup(groupId);
        setAnchored(false);
      }, 200);
    },
    [groupsAsDropdowns, anchored, clearTimers],
  );

  // Al salir del grupo (cabecera + contenido), el preview se cierra con un
  // pequeño margen de gracia; el anclado permanece.
  const onGroupLeave = useCallback(() => {
    if (!groupsAsDropdowns) return;
    if (hoverTimer.current != null) window.clearTimeout(hoverTimer.current);
    if (anchored) return;
    leaveTimer.current = window.setTimeout(() => setOpenGroup(null), 150);
  }, [groupsAsDropdowns, anchored]);

  // Clic: ancla el dropdown; si ya estaba anclado en ese grupo, lo cierra.
  const onGroupClick = useCallback(
    (groupId: string) => {
      clearTimers();
      if (openGroup === groupId && anchored) {
        closeDropdown();
        return;
      }
      setOpenGroup(groupId);
      setAnchored(true);
    },
    [openGroup, anchored, clearTimers, closeDropdown],
  );

  // Clic fuera del nav o Escape cierran el dropdown (anclado incluido).
  useEffect(() => {
    if (!groupsAsDropdowns || openGroup === null) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) closeDropdown();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDropdown();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [groupsAsDropdowns, openGroup, closeDropdown]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
      setMobileOpen(false);
      if (groupsAsDropdowns) closeDropdown();
    },
    [onSelect, groupsAsDropdowns, closeDropdown],
  );

  const renderItems = (filterGroup?: string, onlyId?: string) =>
    items
      .filter((item) => item.group === filterGroup && (onlyId === undefined || item.id === onlyId))
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
        <nav className="sidebar-nav" aria-label="Navegación principal" ref={navRef}>
          {groupsAsDropdowns && groups ? (
            // Modo dropdown: se respeta el ORDEN de `items` — los sin grupo son
            // entradas directas; al encontrar el primer item de un grupo se pinta
            // la entrada del grupo completa (cabecera + contenido desplegable).
            (() => {
              const rendered = new Set<string>();
              const out: React.ReactNode[] = [];
              for (const item of items) {
                if (!item.group) {
                  out.push(
                    <ul className="sidebar-group-items" key={item.id}>
                      {renderItems(undefined, item.id)}
                    </ul>,
                  );
                  continue;
                }
                if (rendered.has(item.group)) continue;
                rendered.add(item.group);
                const group = groups.find((g) => g.id === item.group);
                if (!group) continue;
                const isOpen = openGroup === group.id;
                const groupActive = items.some((i) => i.group === group.id && i.id === activeItem);
                out.push(
                  <div
                    key={group.id}
                    className={`sidebar-group sidebar-group--dd${isOpen ? ' open' : ''}`}
                    onMouseEnter={() => onGroupEnter(group.id)}
                    onMouseLeave={onGroupLeave}
                  >
                    <button
                      type="button"
                      className={`sidebar-item sidebar-group-entry${groupActive ? ' active' : ''}${
                        isOpen && anchored ? ' anchored' : ''
                      }`}
                      onClick={() => onGroupClick(group.id)}
                      title={group.label}
                      aria-expanded={isOpen}
                      aria-haspopup="true"
                      data-testid={`nav-group-${group.id}`}
                    >
                      {group.icon && <span className="sidebar-item-icon">{group.icon}</span>}
                      <span className="sidebar-item-label">{group.label}</span>
                      <svg
                        className={`sidebar-group-chevron${isOpen ? ' open' : ''}`}
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
                    {isOpen && (
                      <ul className="sidebar-group-items sidebar-dd-items">
                        {renderItems(group.id)}
                      </ul>
                    )}
                  </div>,
                );
              }
              return out;
            })()
          ) : (
            <>
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
            </>
          )}
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
