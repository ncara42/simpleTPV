import { useCallback, useEffect, useRef, useState } from 'react';

import { initials } from '../lib/initials.js';
import { Tooltip } from './Tooltip.js';

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
  /** Si true, el item se renderiza DESPUÉS del appSwitch en lugar de antes. */
  afterSwitch?: boolean;
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
   * se despliega inline al hacer CLIC (toggle); otro clic, clic-fuera o Escape lo
   * cierran. Solo un grupo abierto a la vez. No se abre por hover (S-05).
   * Los items sin grupo se renderizan como entradas directas en su posición.
   */
  groupsAsDropdowns?: boolean;
  /**
   * U-04: permite contraer el sidebar a un rail de iconos. Contraído, el clic
   * sobre un grupo abre un flyout lateral con sus opciones (toggle, S-05);
   * los items directos enseñan su nombre vía `title`. Persistido en localStorage.
   */
  collapsible?: boolean;
  /**
   * Sidebar flotante: se separa del borde (esquinas redondeadas, sombra) y puede
   * ESCONDERSE del todo fuera de pantalla, dejando una franja a la izquierda. Al pasar
   * el ratón por esa franja (o sobre el propio sidebar) reaparece flotando como overlay;
   * los iconos enseñan su nombre vía `title`. El estado oculto se persiste en localStorage.
   */
  floating?: boolean;
  /**
   * Controles extra que flotan en el MISMO clúster que el icono de colapsar (a su derecha),
   * p. ej. el buscador de funciones. Se deslizan con el sidebar (nunca quedan debajo). Solo
   * tiene efecto con `floating`.
   */
  floatingActions?: React.ReactNode;
  /** Abre la página de configuración desde el menú del usuario. */
  onSettings?: () => void;
  /** Abre el panel de notificaciones desde el menú del usuario. */
  onNotifications?: () => void;
  /** Nº de notificaciones sin leer; pinta un punto rojo sobre el avatar si > 0. */
  notificationCount?: number;
  /**
   * Acción de cambio de app (p. ej. ir al TPV). Se pinta al FINAL de la lista de
   * navegación, separada por una línea divisoria y con acento azul, para
   * diferenciarla de las entradas del propio backoffice.
   */
  appSwitch?: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    testId?: string;
  };
}

const RAIL_STORAGE_KEY = 'ui.sidebar.collapsed';
const HIDDEN_STORAGE_KEY = 'ui.sidebar.hidden';

function readRailCollapsed(): boolean {
  try {
    return window.localStorage.getItem(RAIL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function BellGlyph() {
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
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function SettingsGlyph() {
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
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
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

function MoonGlyph() {
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
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function SunGlyph() {
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
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

// Toggle claro/oscuro autocontenido (data-theme en <html> + localStorage). Vive en el pie del
// sidebar; el script de arranque de cada index.html fija el tema antes de pintar (sin parpadeo).
function SidebarThemeToggle() {
  const [dark, setDark] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-theme') === 'dark',
  );
  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
      try {
        window.localStorage.setItem('theme', next ? 'dark' : 'light');
      } catch {
        /* modo privado sin storage: el atributo basta para la sesión */
      }
      return next;
    });
  }, []);
  return (
    <button
      type="button"
      className="sidebar-item sidebar-theme-toggle"
      onClick={toggle}
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
      data-testid="theme-toggle"
    >
      <span className="sidebar-item-icon">{dark ? <SunGlyph /> : <MoonGlyph />}</span>
      <span className="sidebar-item-label">{dark ? 'Modo claro' : 'Modo oscuro'}</span>
    </button>
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
  collapsible = false,
  floating = false,
  floatingActions,
  onSettings,
  onNotifications,
  notificationCount = 0,
  appSwitch,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // U-04: rail de iconos persistido. En móvil el panel siempre abre completo.
  const [railCollapsed, setRailCollapsed] = useState(() => collapsible && readRailCollapsed());
  const toggleRail = useCallback(() => {
    setRailCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(RAIL_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* almacenamiento no disponible: el colapso no se recuerda esta sesión */
      }
      return next;
    });
  }, []);
  const collapsed = collapsible && railCollapsed && !mobileOpen;

  // Sidebar flotante: estado «oculto» persistido. Solo aplica con `floating`; en móvil el
  // panel usa siempre su off-canvas propio (mobileOpen). Al ocultarse/mostrarse el sidebar
  // APARECE en su sitio (fundido), no se desliza.
  const [hidden, setHidden] = useState(() => floating && readHidden());
  const toggleHidden = useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(HIDDEN_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* almacenamiento no disponible: no se recuerda esta sesión */
      }
      return next;
    });
  }, []);
  const isHidden = floating && hidden && !mobileOpen;
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // El logo flotante tiene su propio handler (onToggleClick): se excluye del cierre-por-clic-fuera
  // del panel de cuenta para que al pulsarlo cierre el panel y REVELE el cuerpo (no lo oculte).
  const toggleTabRef = useRef<HTMLButtonElement>(null);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const openMenu = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setMenuClosing(false);
    setMenuOpen(true);
  }, []);

  // Anima la salida (120 ms) antes de desmontar.
  const closeMenu = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setMenuClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
    }, 120);
  }, []);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  // Cerrar el menú de cuenta al hacer click fuera o pulsar Escape (patrón de Select).
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!accountRef.current?.contains(target) && !toggleTabRef.current?.contains(target)) {
        closeMenu();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        accountTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, closeMenu]);

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

  // ─── Modo dropdown (D-02): un grupo abierto a la vez, solo por clic (S-05) ──
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const closeDropdown = useCallback(() => setOpenGroup(null), []);

  // Los dos paneles colgantes del clúster flotante (cuerpo del sidebar bajo el logo, panel de
  // cuenta bajo el avatar) son mutuamente excluyentes: abrir el de cuenta eclipsa el cuerpo y
  // cierra cualquier grupo desplegado; el cuerpo reaparece al cerrarlo (clic fuera / opción).
  const toggleAccountMenu = useCallback(() => {
    if (menuOpen && !menuClosing) {
      closeMenu();
    } else {
      openMenu();
      closeDropdown();
    }
  }, [menuOpen, menuClosing, closeMenu, openMenu, closeDropdown]);

  // Pulsar el logo con el panel de cuenta abierto solo lo cierra (revela el cuerpo); si no, hace
  // su función normal de ocultar/mostrar el cuerpo del sidebar flotante.
  const onToggleClick = useCallback(() => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    toggleHidden();
  }, [menuOpen, closeMenu, toggleHidden]);

  // Clic: togglea el grupo. Al ser `openGroup` un único estado, abrir B cierra A.
  const onGroupClick = useCallback((groupId: string) => {
    setOpenGroup((prev) => (prev === groupId ? null : groupId));
  }, []);

  // Clic fuera del nav o Escape cierran el dropdown abierto.
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

  const preItems = items.filter((item) => !item.afterSwitch);
  const postItems = items.filter((item) => item.afterSwitch);

  // `withTooltip`: solo los items PADRE (entradas directas de primer nivel) reciben
  // el tooltip con estilo propio en modo expandido; los hijos de un grupo, no.
  const renderItems = (filterGroup?: string, onlyId?: string, withTooltip = false) =>
    preItems
      .filter((item) => item.group === filterGroup && (onlyId === undefined || item.id === onlyId))
      .map((item, index) => {
        const isActive = activeItem === item.id;
        // En expandido manda el <Tooltip>; en rail, la burbuja CSS. Por eso el title
        // nativo solo se usa cuando NO hay tooltip de componente (evita duplicar).
        const usesTooltip = withTooltip && !collapsed;
        const button = (
          <button
            type="button"
            className={`sidebar-item${isActive ? ' active' : ''}`}
            onClick={() => handleSelect(item.id)}
            title={usesTooltip || collapsed ? undefined : item.label}
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
        );
        return (
          <li key={item.id}>
            {usesTooltip ? <Tooltip label={item.label}>{button}</Tooltip> : button}
          </li>
        );
      });

  return (
    <>
      {/* Hamburguesa móvil: en <768px el sidebar va off-canvas; este botón fijo
          es su único acceso (antes no existía: el menú era inalcanzable). */}
      <button
        type="button"
        className="sidebar-mobile-trigger"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
        data-testid="sidebar-open"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div
        className={`sidebar-overlay${mobileOpen ? ' visible' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`sidebar${mobileOpen ? ' mobile-open' : ''}${collapsed ? ' collapsed' : ''}${
          floating ? ' sidebar--floating' : ''
        }${isHidden ? ' is-hidden' : ''}${floating && menuOpen ? ' is-eclipsed' : ''}`}
      >
        {/* Header: logotipo de la empresa. */}
        <div className="sidebar-header">
          <span className="sidebar-logo">{logo ?? 'S'}</span>
          {brand && (
            <span className="sidebar-brand">
              <span className="sidebar-brand-title">{brand.title}</span>
              {brand.subtitle && <span className="sidebar-brand-sub">{brand.subtitle}</span>}
            </span>
          )}
          {collapsible && !floating && (
            <button
              type="button"
              className="sidebar-collapse"
              onClick={toggleRail}
              data-testid="sidebar-collapse"
              aria-pressed={collapsed}
              title={collapsed ? 'Expandir menú' : 'Contraer menú'}
            >
              <svg
                className={`sidebar-collapse-icon${collapsed ? ' is-rail' : ''}`}
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
                <polyline points="11 17 6 12 11 7" />
                <polyline points="18 17 13 12 18 7" />
              </svg>
            </button>
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
                      {renderItems(undefined, item.id, true)}
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
                // La cabecera de grupo es un item «padre». En EXPANDIDO usa el <Tooltip>
                // JS (portal, escapa del overflow). En RAIL usa la MISMA burbuja CSS que
                // los items directos (instantánea y consistente, ver sidebar.css), por eso
                // el Tooltip JS se desactiva ahí. También se desactiva con el flyout abierto.
                const groupEntry = (
                  <button
                    type="button"
                    className={`sidebar-item sidebar-group-entry${groupActive ? ' active' : ''}`}
                    onClick={() => onGroupClick(group.id)}
                    aria-label={group.label}
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
                );
                out.push(
                  <div
                    key={group.id}
                    className={`sidebar-group sidebar-group--dd${isOpen ? ' open' : ''}`}
                  >
                    <Tooltip label={group.label} disabled={collapsed || isOpen}>
                      {groupEntry}
                    </Tooltip>
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

          {/* Bloque inferior: divisor + items afterSwitch (p. ej. Ayuda) + TPV.
              Todo comparte el mismo border-top para quedar visualmente agrupado. */}
          {(appSwitch || postItems.length > 0) && (
            <div className="sidebar-app-switch">
              {postItems.length > 0 && (
                <ul className="sidebar-group-items">
                  {postItems.map((item, index) => {
                    const isActive = activeItem === item.id;
                    const button = (
                      <button
                        type="button"
                        className={`sidebar-item${isActive ? ' active' : ''}`}
                        onClick={() => handleSelect(item.id)}
                        title={collapsed ? undefined : item.label}
                        aria-current={isActive ? 'page' : undefined}
                        data-testid={`nav-${item.id}`}
                      >
                        <span
                          className="sidebar-item-icon"
                          style={
                            { '--sidebar-icon-anim': iconAnimAt(index) } as React.CSSProperties
                          }
                        >
                          {item.icon}
                        </span>
                        <span className="sidebar-item-label">{item.label}</span>
                      </button>
                    );
                    return (
                      <li key={item.id}>
                        {!collapsed ? <Tooltip label={item.label}>{button}</Tooltip> : button}
                      </li>
                    );
                  })}
                </ul>
              )}
              {appSwitch && (
                <button
                  type="button"
                  className="sidebar-item sidebar-item--app"
                  onClick={() => {
                    appSwitch.onClick();
                    setMobileOpen(false);
                  }}
                  title={appSwitch.label}
                  data-testid={appSwitch.testId ?? 'sidebar-app-switch'}
                >
                  <span className="sidebar-item-icon">{appSwitch.icon}</span>
                  <span className="sidebar-item-label">{appSwitch.label}</span>
                </button>
              )}
            </div>
          )}
        </nav>

        {/* Footer: cuenta (estilo ChatGPT) o cierre de sesión simple. En modo flotante la cuenta
            se saca del pie y vive como avatar suelto junto al logo (ver más abajo), para que el
            cuerpo se recorte a la altura de su contenido. */}
        {!floating &&
          (account ? (
            <div className="sidebar-footer" ref={accountRef}>
              {menuOpen && (
                <div
                  className={`sidebar-account-menu${menuClosing ? ' sidebar-account-menu--closing' : ''}`}
                  role="menu"
                  aria-label="Cuenta"
                  ref={menuRef}
                  onKeyDown={onMenuKeyDown}
                >
                  {onSettings && (
                    <button
                      type="button"
                      className="sidebar-account-menu-item"
                      role="menuitem"
                      onClick={() => {
                        closeMenu();
                        onSettings();
                      }}
                      data-testid="nav-settings"
                    >
                      <span className="sidebar-account-menu-icon">
                        <SettingsGlyph />
                      </span>
                      <span>Configuración</span>
                    </button>
                  )}
                  {onLogout && (
                    <button
                      type="button"
                      className="sidebar-account-menu-item sidebar-account-menu-item--danger"
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
                  )}
                </div>
              )}
              {/* Toggle de tema ENCIMA de la cuenta, separado por un filete divisor. */}
              <SidebarThemeToggle />
              <div className="sidebar-footer-sep" aria-hidden="true" />
              <button
                type="button"
                className={`sidebar-account sidebar-account--footer${menuOpen && !menuClosing ? ' open' : ''}`}
                ref={accountTriggerRef}
                onClick={() => {
                  if (menuOpen && !menuClosing) {
                    closeMenu();
                  } else {
                    openMenu();
                  }
                }}
                data-testid="account-menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen && !menuClosing}
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
          ))}
      </aside>

      {/* Pestaña-LOGO: el ÚNICO elemento enganchado al cuerpo, conectado a él con un filete
          CÓNCAVO a su derecha (el cuerpo blanco flarea y RODEA el logo, ver .sidebar-toggle-tab
          en sidebar.css). Es a la vez la marca y la afordancia de ocultar/mostrar el sidebar
          flotante: al hacer clic se pliega/despliega el cuerpo. */}
      {floating && (
        <button
          type="button"
          // Con el panel de cuenta abierto el cuerpo del sidebar se eclipsa: el logo queda como
          // círculo suelto (is-collapsed) para que su cuello cóncavo no cuelgue hacia la nada.
          className={`sidebar-toggle-tab${isHidden || menuOpen ? ' is-collapsed' : ''}`}
          ref={toggleTabRef}
          onClick={onToggleClick}
          data-testid="sidebar-toggle"
          aria-pressed={!isHidden}
          aria-label={isHidden ? 'Mostrar menú' : 'Ocultar menú'}
          title={isHidden ? 'Mostrar menú' : 'Ocultar menú'}
        >
          <span className="sidebar-tab-logo" aria-hidden="true">
            {logo ?? 'S'}
          </span>
        </button>
      )}

      {/* Avatar de cuenta: círculo suelto a la DERECHA del logo (modo flotante). Sustituye al pie
          de cuenta; abre el menú (cerrar sesión) hacia ABAJO. Así el cuerpo no necesita pie y se
          recorta a la altura de su contenido. */}
      {floating && account && (
        <div className="sidebar-account-float" ref={accountRef}>
          <button
            type="button"
            className={`sidebar-account-fab${menuOpen ? ' open' : ''}`}
            ref={accountTriggerRef}
            onClick={toggleAccountMenu}
            data-testid="account-menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={account.name}
          >
            <span className="sidebar-account-avatar" aria-hidden="true">
              {initials(account.name)}
            </span>
            {notificationCount > 0 && (
              <span className="sidebar-account-notif-dot" aria-hidden="true" />
            )}
          </button>
          {menuOpen && (
            <div
              className="sidebar-account-panel"
              role="menu"
              aria-label="Cuenta"
              ref={menuRef}
              onKeyDown={onMenuKeyDown}
            >
              <ul className="sidebar-account-panel-items">
                {onNotifications && (
                  <li>
                    <button
                      type="button"
                      className="sidebar-item"
                      role="menuitem"
                      onClick={() => {
                        closeMenu();
                        onNotifications();
                      }}
                      data-testid="nav-notifications"
                    >
                      <span className="sidebar-item-icon">
                        <BellGlyph />
                      </span>
                      <span className="sidebar-item-label">Alertas</span>
                      {notificationCount > 0 && (
                        <span className="sidebar-item-badge">{notificationCount}</span>
                      )}
                    </button>
                  </li>
                )}
                {onLogout && (
                  <li>
                    <button
                      type="button"
                      className="sidebar-item sidebar-item--danger"
                      role="menuitem"
                      onClick={() => {
                        closeMenu();
                        onLogout();
                      }}
                      data-testid="logout"
                    >
                      <span className="sidebar-item-icon">
                        <LogoutGlyph />
                      </span>
                      <span className="sidebar-item-label">Cerrar sesión</span>
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Buscador: pill INDEPENDIENTE, flotando aparte (sus propios márgenes), a la misma
          altura que el toggle. No forma parte ni de la pill del toggle ni del sidebar. */}
      {floating && floatingActions && <div className="sidebar-search-float">{floatingActions}</div>}
    </>
  );
}
