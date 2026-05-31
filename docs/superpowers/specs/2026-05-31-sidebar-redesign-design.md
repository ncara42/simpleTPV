# Rediseño UI/UX con sidebar — simpleTPV

**Fecha:** 2026-05-31
**Alcance:** `packages/ui` (Sidebar + theme.css + sidebar.css), `apps/backoffice`, `apps/tpv`
**Sin cambios:** lógica de negocio, handlers API, React Query, Zustand, data-testids de formularios

---

## 1. Objetivo

Reemplazar la navegación por pestañas horizontales de backoffice y TPV por un sidebar izquierdo consistente en ambas apps. El sidebar arranca como rail de iconos (56px) y se expande a texto completo (220px) al hacer hover o al fijar manualmente. Paleta: light sidebar (#f5f5f5) sobre contenido blanco.

---

## 2. Librería de iconos

`lucide-react` se instala en `apps/backoffice` y `apps/tpv`. No en `packages/ui` — el Sidebar recibe iconos como `React.ReactNode` vía props, sin acoplarse a ninguna librería.

---

## 3. Tokens de diseño

En `packages/ui/src/styles/theme.css` (ya existe, se actualiza):

```css
:root {
  --sidebar-bg: #f5f5f5;
  --sidebar-width-rail: 56px;
  --sidebar-width-expanded: 220px;
  --sidebar-current-width: 56px; /* actualizado por JS al expandir */
  --sidebar-item-active-bg: #e5e5e5;
  --sidebar-item-hover-bg: #ebebeb;
  --sidebar-text: #737373;
  --sidebar-text-active: #171717;
  --sidebar-group-label-color: #a3a3a3;
  --sidebar-border: #e5e5e5;
  --content-bg: #ffffff;
  --app-border: #e5e5e5;
}
```

---

## 4. Componente Sidebar

### 4.1 Ubicación y export

- `packages/ui/src/components/Sidebar.tsx`
- `packages/ui/src/styles/sidebar.css`
- Exportados desde `packages/ui/src/index.ts`
- `packages/ui/package.json` añade `"./sidebar.css": "./src/styles/sidebar.css"`

### 4.2 Props

```ts
export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  group?: string; // id del NavGroup al que pertenece
}

export interface NavGroup {
  id: string;
  label: string; // texto del separador de grupo
}

export interface SidebarProps {
  items: NavItem[];
  groups?: NavGroup[];
  activeItem: string;
  onSelect: (id: string) => void;
  user?: { name: string; email: string };
  onLogout?: () => void;
  logo?: React.ReactNode; // por defecto: "S"
  statusBadge?: React.ReactNode; // ej: badge "CAJA ABIERTA" en TPV
}
```

### 4.3 Comportamiento

- **Rail → expandido por hover:** `onMouseEnter` expande, `onMouseLeave` colapsa, salvo que esté fijado.
- **Fijar expansión:** clic en el botón logo/marca alterna entre fijado y hover-only. Estado persistido en `localStorage` con clave `simpletpv-sidebar-pinned`.
- **Notificar ancho al shell:** al cambiar estado, el Sidebar hace `document.documentElement.style.setProperty('--sidebar-current-width', expanded ? '220px' : '56px')`. El `.app-content` usa `margin-left: var(--sidebar-current-width)` con `transition: margin-left 150ms ease`.
- **Grupos colapsables:** `useState<Record<string, boolean>>` interno, todos expandidos por defecto, no persistido.
- **En rail:** labels y cabeceras de grupo con `opacity: 0` (no `display: none`, para mantener el layout). Tooltip nativo `title` en cada item.
- **Móvil (< 768px):** sidebar con `transform: translateX(-100%)` por defecto. Botón hamburger en un header mínimo. Clase `.mobile-open` muestra el sidebar como drawer con overlay.

### 4.4 CSS (`sidebar.css`)

```css
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  width: var(--sidebar-width-rail);
  background: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  z-index: 30;
  overflow: hidden;
  transition: width 150ms ease;
}
.sidebar.expanded {
  width: var(--sidebar-width-expanded);
}

.sidebar-header {
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 1rem;
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
}
.sidebar-logo-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: none;
  border: none;
  font-weight: 700;
  font-size: 0.875rem;
  color: var(--sidebar-text-active);
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.sidebar-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.5rem 0.25rem;
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--sidebar-group-label-color);
  opacity: 0;
  transition: opacity 100ms;
  cursor: pointer;
  background: none;
  border: none;
  width: 100%;
}
.sidebar.expanded .sidebar-group-header {
  opacity: 1;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: 0.375rem;
  cursor: pointer;
  color: var(--sidebar-text);
  transition: background 100ms;
  width: 100%;
  background: none;
  border: none;
  text-align: left;
}
.sidebar-item:hover {
  background: var(--sidebar-item-hover-bg);
}
.sidebar-item.active {
  background: var(--sidebar-item-active-bg);
  color: var(--sidebar-text-active);
  font-weight: 500;
}

.sidebar-item-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sidebar-item-label {
  font-size: 0.875rem;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 100ms;
  overflow: hidden;
}
.sidebar.expanded .sidebar-item-label {
  opacity: 1;
}

.sidebar-footer {
  padding: 0.5rem;
  border-top: 1px solid var(--sidebar-border);
  flex-shrink: 0;
}

/* Móvil */
@media (max-width: 767px) {
  .sidebar {
    transform: translateX(-100%);
    transition:
      transform 150ms ease,
      width 150ms ease;
    width: var(--sidebar-width-expanded);
  }
  .sidebar.mobile-open {
    transform: translateX(0);
  }
  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 29;
  }
  .sidebar-overlay.visible {
    display: block;
  }
}
```

---

## 5. Shell de cada app

### 5.1 Layout

```css
/* en styles.css de cada app */
.app-shell {
  display: flex;
  min-height: 100vh;
}
.app-content {
  margin-left: var(--sidebar-current-width);
  flex: 1;
  background: var(--content-bg);
  transition: margin-left 150ms ease;
  min-width: 0;
}
@media (max-width: 767px) {
  .app-content {
    margin-left: 0;
  }
}
```

### 5.2 Backoffice — `App.tsx`

**Tipo Tab actualizado:**

```ts
type Tab =
  | 'dashboard'
  | 'catalog'
  | 'families'
  | 'stock'
  | 'users'
  | 'stores'
  | 'sales'
  | 'purchases'
  | 'verifactu';
```

**Nav config:**

```tsx
import {
  LayoutDashboard,
  Package,
  Tag,
  BarChart2,
  Users,
  Store,
  Receipt,
  ShoppingCart,
  CheckSquare,
  LogOut,
} from 'lucide-react';

const GROUPS: NavGroup[] = [
  { id: 'tienda', label: 'Tienda' },
  { id: 'gestion', label: 'Gestión' },
  { id: 'ventas', label: 'Ventas' },
];

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'catalog', label: 'Catálogo', icon: <Package size={18} />, group: 'tienda' },
  { id: 'families', label: 'Familias', icon: <Tag size={18} />, group: 'tienda' },
  { id: 'stock', label: 'Stock', icon: <BarChart2 size={18} />, group: 'tienda' },
  { id: 'users', label: 'Usuarios', icon: <Users size={18} />, group: 'gestion' },
  { id: 'stores', label: 'Tiendas', icon: <Store size={18} />, group: 'gestion' },
  { id: 'sales', label: 'Ventas', icon: <Receipt size={18} />, group: 'ventas' },
  { id: 'purchases', label: 'Compras', icon: <ShoppingCart size={18} />, group: 'ventas' },
  { id: 'verifactu', label: 'VeriFactu', icon: <CheckSquare size={18} />, group: 'ventas' },
];
```

**JSX Home:**

```tsx
<div className="app-shell">
  <Sidebar
    items={NAV}
    groups={GROUPS}
    activeItem={tab}
    onSelect={(id) => setTab(id as Tab)}
    user={user}
    onLogout={logout}
  />
  <div className="app-content">
    {tab === 'dashboard' && <DashboardPage />}
    {tab === 'catalog' && <CatalogPage />}
    {/* ... resto igual */}
  </div>
</div>
```

### 5.3 TPV — `App.tsx`

**Tipo View actualizado:**

```ts
type View = 'sale' | 'return' | 'transfers' | 'cash';
```

**Nav config:**

```tsx
import { ShoppingBag, RotateCcw, ArrowLeftRight, Banknote, LogOut } from 'lucide-react';

const TPV_NAV: NavItem[] = [
  { id: 'sale', label: 'Venta', icon: <ShoppingBag size={18} /> },
  { id: 'return', label: 'Devolución', icon: <RotateCcw size={18} /> },
  { id: 'transfers', label: 'Traspasos', icon: <ArrowLeftRight size={18} /> },
  { id: 'cash', label: 'Caja', icon: <Banknote size={18} /> },
];
```

**JSX Home:**

```tsx
<div className="app-shell">
  <Sidebar
    items={TPV_NAV}
    activeItem={view}
    onSelect={(id) => setView(id as View)}
    user={user}
    onLogout={logout}
  />
  <div className="app-content">
    {view === 'sale' && <SalePage />}
    {view === 'return' && <ReturnsView />}
    {view === 'transfers' && <TransferReceivePanel />}
    {view === 'cash' && <CashPanel />}
  </div>
</div>
```

**Nota Caja:** `CashPanel` ya existe. Pasa a ser una vista directa en lugar de estar implícita. No hay cambios en su lógica.

**Nota Devolución:** `ReturnsView` (con sus botones "Con ticket" / "Sin ticket") permanece igual dentro del componente — la subnavegación no va al sidebar.

---

## 6. Data-testids

| Testid antiguo                     | Testid nuevo                  | Dónde                   |
| ---------------------------------- | ----------------------------- | ----------------------- |
| `data-testid="tab-sale"`           | `data-testid="nav-sale"`      | `Sidebar` item          |
| `data-testid="tab-return"`         | `data-testid="nav-return"`    | `Sidebar` item          |
| `data-testid="tab-transfers"`      | `data-testid="nav-transfers"` | `Sidebar` item          |
| `data-testid="return-mode-ticket"` | sin cambio                    | dentro de `ReturnPanel` |
| `data-testid="return-mode-blind"`  | sin cambio                    | dentro de `ReturnPanel` |
| `data-testid="logout"`             | `data-testid="logout"`        | footer del `Sidebar`    |

Los items del Sidebar llevan `data-testid={`nav-${item.id}`}` generado automáticamente.

---

## 7. Eliminaciones

| Elemento                      | Archivo                           | Acción                     |
| ----------------------------- | --------------------------------- | -------------------------- |
| Componente `NavTab`           | `apps/backoffice/src/App.tsx`     | Eliminar                   |
| Componente `NavTab`           | `apps/tpv/src/App.tsx`            | Eliminar                   |
| Función `ReturnsView` interna | `apps/tpv/src/App.tsx`            | Mantener (sin cambios)     |
| Reglas `.bo-tabs`, `.bo-tab`  | `apps/backoffice/src/catalog.css` | Eliminar                   |
| Reglas `.tpv-nav`, `.tpv-tab` | `apps/tpv/src/sale.css`           | Eliminar                   |
| `<header>` con nav horizontal | Ambas `App.tsx`                   | Reemplazar por `<Sidebar>` |

---

## 8. Archivos afectados

| Archivo                                  | Acción                                                          |
| ---------------------------------------- | --------------------------------------------------------------- |
| `packages/ui/src/styles/theme.css`       | Añadir tokens sidebar                                           |
| `packages/ui/src/styles/sidebar.css`     | Crear                                                           |
| `packages/ui/src/components/Sidebar.tsx` | Crear                                                           |
| `packages/ui/src/index.ts`               | Exportar Sidebar + tipos                                        |
| `packages/ui/package.json`               | Añadir export `./sidebar.css`                                   |
| `apps/backoffice/package.json`           | Añadir `lucide-react`                                           |
| `apps/backoffice/src/App.tsx`            | Reemplazar nav por Sidebar                                      |
| `apps/backoffice/src/styles.css`         | Importar theme.css, sidebar.css, añadir .app-shell/.app-content |
| `apps/backoffice/src/catalog.css`        | Eliminar reglas .bo-tabs/.bo-tab                                |
| `apps/tpv/package.json`                  | Añadir `lucide-react`                                           |
| `apps/tpv/src/App.tsx`                   | Reemplazar nav por Sidebar, añadir view 'cash'                  |
| `apps/tpv/src/styles.css`                | Importar theme.css, sidebar.css, añadir .app-shell/.app-content |
| `apps/tpv/src/sale.css`                  | Eliminar reglas .tpv-nav/.tpv-tab                               |

---

## 9. Tests

Sin tests unitarios para el Sidebar (hover/expand difícil con jsdom). Verificación manual:

1. Backoffice: sidebar en rail al cargar, se expande al hover, grupos colapsables funcionan, pin persiste tras recarga
2. TPV: misma verificación, "Caja" navega a CashPanel
3. Móvil: hamburger visible, drawer con overlay funciona
4. `data-testid="nav-sale"` etc. responden al clic
5. El margen del contenido se ajusta fluidamente al expandir/colapsar
6. Login no muestra sidebar (condición `isAuthed` en App.tsx, sin cambios)
7. Los tests existentes de `packages/ui` siguen pasando
