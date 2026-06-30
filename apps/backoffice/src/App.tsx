import '@simpletpv/ui/chart.css';
import '@simpletpv/ui/datatable.css';
import '@simpletpv/ui/dataviz.css';
import '@simpletpv/ui/login.css';
import '@simpletpv/ui/select.css';
import '@simpletpv/ui/topbar.css';
import '@simpletpv/ui/transfer-chat.css';
import './catalog.css';
import './help.css';
import './catalog/inventory-card.css';
import './catalog/families-nav.css';
import './stock/existences.css';
import './stock/transfers.css';
import './sales/ventas.css';
import './b2b/customers.css';
import './b2b/pricelists.css';
import './b2b/pedidos.css';
import './promotions/promotions.css';
import './styles/scroll-shadow.css';
import './styles.css';

import { LoginForm, type NavGroup, type NavItem, Sidebar, TopBar } from '@simpletpv/ui';
import { PageHeaderProvider } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Bell,
  BriefcaseBusiness,
  Building2,
  CheckSquare,
  CreditCard,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Percent,
  ScanLine,
  Settings,
  Store,
  Tag,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { B2bPage } from './B2bPage.js';
import { AssistantDock } from './components/chat/AssistantDock.js';
import { AssistantLauncher } from './components/chat/AssistantLauncher.js';
import { CanvasToolsMenu } from './components/chat/CanvasToolsMenu.js';
import { viewContextFor } from './components/chat/view-context.js';
import { DashboardAddWidget } from './components/DashboardAddWidget.js';
import { DashboardModeToggle } from './components/DashboardModeToggle.js';
import { FunctionSearch } from './components/FunctionSearch.js';
import { DashboardPage } from './DashboardPage.js';
import { HelpPage } from './HelpPage.js';
import { InventoryPage } from './InventoryPage.js';
import { api, useAuthStore } from './lib/auth.js';
import { useBranding } from './lib/branding.js';
import { useCanvasBridge } from './lib/canvas-bridge.js';
import { listPendingCashMovements } from './lib/cash.js';
import { useDevAutoLogin } from './lib/dev-autologin.js';
import { useFeatures } from './lib/features.js';
import { switchApp, type Tab } from './lib/nav.js';
import { pathToTab, tabToPath } from './lib/navigation.js';
import { PageActionsProvider, usePageActionsValue } from './lib/pageActions.js';
import { PageNavProvider, usePageNavValue } from './lib/pageNav.js';
import { listAlerts } from './lib/stock.js';
import { NotificationsPage } from './NotificationsPage.js';
import { PersonalPage } from './PersonalPage.js';
import { PromotionsPage } from './PromotionsPage.js';
import { SalesHistoryPage } from './SalesHistoryPage.js';
import { SettingsPage } from './SettingsPage.js';
import { StoresPage } from './StoresPage.js';
import { SuppliersPage } from './SuppliersPage.js';
import { TransfersPage } from './TransfersPage.js';
import { VerifactuPage } from './VerifactuPage.js';

// Menú de 5 entradas (D-02/D-09): Dashboard y Ayuda son pages directas; los tres
// grupos se despliegan como dropdown (hover sostenido >200ms = preview; clic =
// anclado). El mapa de contenido por grupo es el cerrado en informe_decisiones D-09.
const NAV_GROUPS: NavGroup[] = [
  { id: 'inventory', label: 'Catálogo e inventario', icon: <Tag size={18} /> },
  { id: 'commercial', label: 'Ventas y clientes', icon: <TrendingUp size={18} /> },
  { id: 'org', label: 'Organización', icon: <Building2 size={18} /> },
  { id: 'rrhh', label: 'RRHH', icon: <BriefcaseBusiness size={18} /> },
];

const ALL_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Asistente de IA', icon: <LayoutDashboard size={18} /> },
  { id: 'notifications', label: 'Notificaciones', icon: <Bell size={18} />, group: 'inventory' },
  // S-02 fase A: una sola entrada "Inventario" monta InventoryPage con vistas
  // segmentadas (Catálogo · Familias · Existencias). Las tres entradas previas se
  // colapsan aquí; sus rutas siguen vivas (deep-link/redirección) pero ocultas del menú.
  { id: 'inventory', label: 'Inventario', icon: <Package size={18} />, group: 'inventory' },
  { id: 'transfers', label: 'Traspasos', icon: <ArrowLeftRight size={18} />, group: 'inventory' },
  { id: 'suppliers', label: 'Proveedores', icon: <Truck size={18} />, group: 'inventory' },
  // Ventas y clientes (D-09): Ventas · Clientes B2B · Promociones
  { id: 'sales', label: 'Ventas', icon: <CreditCard size={18} />, group: 'commercial' },
  { id: 'b2b', label: 'Clientes B2B', icon: <Handshake size={18} />, group: 'commercial' },
  { id: 'promotions', label: 'Promociones', icon: <Percent size={18} />, group: 'commercial' },
  // Organización (D-09 + U-08): Tiendas · Personal · Ajustes
  { id: 'stores', label: 'Tiendas', icon: <Store size={18} />, group: 'org' },
  // S-01: una sola entrada "Personal" monta PersonalPage con vistas segmentadas
  // (Equipo · Fichajes). Las entradas previas Usuarios/Control horario se colapsan
  // aquí; sus rutas siguen vivas (deep-link/redirección) pero ocultas del menú. El flag
  // time_clock pasa a condicionar el segmento Fichajes (P003), no la entrada de menú.
  { id: 'personal', label: 'Personal', icon: <Users size={18} />, group: 'rrhh' },
  { id: 'settings', label: 'Configuración', icon: <Settings size={18} />, group: 'org' },
  { id: 'verifactu', label: 'VeriFactu', icon: <CheckSquare size={18} />, group: 'org' },
  { id: 'help', label: 'Ayuda', icon: <LifeBuoy size={18} />, afterSwitch: true },
];

// VeriFactu se mantiene fuera del menú (backend sin UI). Notificaciones también:
// su acceso es la campana de la TopBar (mismo destino y badge), así que la entrada
// del menú era redundante. Compras dejó de ser una página propia: sus secciones
// viven ahora dentro de Proveedores (P1-B). El código se conserva para reactivar
// VeriFactu/Notificaciones quitando su id de este set.
const HIDDEN_TABS = new Set<Tab>(['notifications', 'verifactu', 'settings']);
const NAV: NavItem[] = ALL_NAV.filter((item) => !HIDDEN_TABS.has(item.id as Tab));

// Lee las acciones de la vista activa (cada page las declara con usePageActions) y
// las inyecta en el clúster derecho del topbar (antes vivían en el clúster flotante).
function PageActionsSlot() {
  return <>{usePageActionsValue()}</>;
}

// Lee la sub-navegación de la vista activa (pestañas Catálogo/Familias…) y la
// inyecta en la columna izquierda del topbar.
function PageNavSlot() {
  return <>{usePageNavValue()}</>;
}

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const location = useLocation();
  // La pestaña activa se DERIVA de la URL (react-router, F0): el reload y los deep-links
  // conservan la vista (antes useState reseteaba a dashboard al recargar). Ruta desconocida
  // → dashboard. Cambiar de vista = navigate(path); todo el DOM observable se mantiene igual.
  const tab = pathToTab(location.pathname) ?? 'dashboard';
  // URL COMPLETA previa (path + search), no solo el Tab: así volver de Notificaciones
  // conserva la vista/filtros de Inventario (?vista=, ?store=, ?q=) y de cualquier page.
  const [prevLocation, setPrevLocation] = useState<string>('/');
  // La campana togglea Notificaciones: si está abierta, vuelve a la URL previa; si no,
  // recuerda la actual y abre Notificaciones. Lee tab/location del render actual.
  const toggleNotifications = (): void => {
    if (tab === 'notifications') {
      navigate(prevLocation === '/notifications' ? '/' : prevLocation);
    } else {
      setPrevLocation(location.pathname + location.search);
      navigate(tabToPath('notifications'));
    }
  };
  // U-08: tema corporativo (color aplicado como tokens; el logo va al sidebar).
  const branding = useBranding();
  // Feature flags (#127 B): oculta del menú los módulos apagados a nivel org (el
  // backoffice es central → resolución de org). El backend sigue bloqueando con 403.
  const features = useFeatures();
  // S-01: el flag time_clock ya no oculta una entrada de menú (Personal es siempre
  // visible); ahora condiciona el segmento Fichajes dentro de PersonalPage (P003).
  const navItems = NAV.filter((item) => {
    if (item.id === 'b2b') return features.b2b;
    return true;
  });
  // Filtros «de paso» (tienda/familia/búsqueda) en la URL como search params (F0c): el
  // deep-link es compartible, sobrevive al reload y NO deja estado residual al volver con el
  // botón atrás. Las pages los leen al montar vía sus props initial* (sin cambiar su lógica).
  const [searchParams] = useSearchParams();
  // Acceso directo desde Tiendas ("Ver stock"/"Ver ventas"): preselecciona la tienda.
  // S-02 fase A: "Ver stock" abre el shell de Inventario en la vista Existencias; "Ver
  // ventas" sigue yendo a la página de Ventas sin cambios.
  const openStoreView = (view: 'stock' | 'sales', storeId: string): void => {
    if (view === 'stock') {
      navigate(`/inventario?vista=existencias&store=${encodeURIComponent(storeId)}`);
      return;
    }
    navigate(`${tabToPath('sales')}?store=${encodeURIComponent(storeId)}`);
  };
  // Atajo del panel de Familias (I-13): el contador navega al Catálogo filtrado dentro
  // del shell de Inventario (vista Catálogo).
  const openCatalogFamily = (familyId: string): void => {
    navigate(`/inventario?vista=catalogo&family=${encodeURIComponent(familyId)}`);
  };
  // S-25: acceso directo (≤1 clic) a la comparativa de precios entre proveedores.
  // Deep-link por query a Proveedores con la sub-vista comparativa preseleccionada
  // (`?vista=comparativa`), reutilizando la Tab 'suppliers' (sin nuevo id de Tab).
  const openSupplierComparison = (): void => {
    navigate('/suppliers?vista=comparativa');
  };
  // U-12: "Resolver" una notificación → Inventario (vista Existencias) filtrado por
  // tienda y producto.
  const resolveStock = (storeId: string, productName: string): void => {
    navigate(
      `/inventario?vista=existencias&store=${encodeURIComponent(storeId)}&q=${encodeURIComponent(productName)}`,
    );
  };
  // U-11/D-17: badge de la campana = roturas de stock activas + solicitudes de
  // caja pendientes (#146). Mismas queryKeys que Notificaciones (refresca con el
  // SSE de esa vista).
  const { data: alerts = [] } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: () => listAlerts(),
  });
  const { data: pendingCash = [] } = useQuery({
    queryKey: ['pending-cash-movements'],
    queryFn: () => listPendingCashMovements(),
  });
  const notificationCount = alerts.length + pendingCash.length;

  // Navegación entre pages (sidebar / home / buscador): va a la ruta SIN query, lo que
  // limpia los filtros de paso (ya no son estado del shell; viven en la URL).
  const navigateTo = (t: Tab): void => {
    navigate(tabToPath(t));
  };

  // S-02 fase A — Redirección de rutas antiguas: /catalog · /families · /stock siguen
  // resolviendo a su Tab (oculta) para no romper deep-links existentes, pero ya no tienen
  // página propia; las absorbe el shell de Inventario. Mapeamos cada una a su vista y
  // conservamos los search params (family/store/q) en la URL destino. `replace` evita
  // dejar la ruta vieja en el historial.
  const LEGACY_VISTA: Partial<Record<Tab, string>> = {
    catalog: 'catalogo',
    families: 'familias',
    stock: 'existencias',
  };
  const legacyVista = LEGACY_VISTA[tab];

  // S-01 — Redirección de rutas antiguas: /users · /timeclock siguen resolviendo a su
  // Tab (oculta) para no romper deep-links, pero ya no tienen página propia; las absorbe
  // el shell de Personal. Cada una mapea a su vista (Equipo / Fichajes) preservando los
  // demás search params. `replace` evita dejar la ruta vieja en el historial.
  const PERSONAL_VISTA: Partial<Record<Tab, string>> = {
    users: 'equipo',
    timeclock: 'fichajes',
  };
  const personalVista = PERSONAL_VISTA[tab];

  // Nombre de la view activa (el mismo label del sidebar): se pinta como etiqueta flotante
  // arriba del lienzo —donde antes vivía el chip del dashboard— sustituyendo al título del header.
  const activeLabel = ALL_NAV.find((item) => item.id === tab)?.label ?? '';
  // El Dashboard es el único lienzo libre full-bleed; el resto de views flotan como una
  // superficie sobre el fondo (se reutiliza su contenido actual, sin rediseñar cards).
  const isCanvas = tab === 'dashboard';
  // Lienzo del Dashboard: handle imperativo + meta reactiva (lo registra DashboardPage en el
  // canvas-bridge). Lo usa la barra de herramientas flotante de la topbar (Editar/Mover/Goma).
  const canvasBinding = useCanvasBridge((s) => s.binding);

  if (legacyVista) {
    const extra = location.search ? `&${location.search.slice(1)}` : '';
    return <Navigate to={`/inventario?vista=${legacyVista}${extra}`} replace />;
  }

  if (personalVista) {
    const extra = location.search ? `&${location.search.slice(1)}` : '';
    return <Navigate to={`/personal?vista=${personalVista}${extra}`} replace />;
  }

  return (
    <PageNavProvider>
      <PageActionsProvider>
        <div className="app-shell">
          <Sidebar
            items={navItems}
            groups={NAV_GROUPS}
            groupsAsDropdowns
            collapsible
            logo={
              branding?.logoUrl ? (
                <img className="sidebar-logo-img" src={branding.logoUrl} alt="Logo" />
              ) : undefined
            }
            activeItem={tab}
            onSelect={(id) => navigateTo(id as Tab)}
            // La cuenta vive al PIE del sidebar (avatar → menú con cerrar sesión), estilo
            // ChatGPT/Claude; en rail se reduce al avatar. La campana sigue en el topbar.
            account={{ name: 'Administrador', subtitle: 'Central · Admin' }}
            onSettings={() => navigateTo('settings')}
            onLogout={logout}
            // El TPV es la última entrada del sidebar (appSwitch), separada por una línea y en azul.
            appSwitch={{
              label: 'TPV',
              icon: <ScanLine size={19} aria-hidden="true" />,
              onClick: () => switchApp('tpv'),
              testId: 'switch-tpv',
            }}
          />
          {/* En views NO-lienzo anulamos la columna reservada del sidebar flotante: el lienzo de
          puntitos va full-bleed y el sidebar flota por encima (como en el Dashboard). */}
          <div className={`app-content${isCanvas ? '' : ' app-content--surface'}`}>
            <PageHeaderProvider>
              {/* Topbar flotante siempre presente: isla central (atrás · nombre de la vista ·
              tema · campana) + clúster derecho (acciones de la vista · búsqueda ⌘K · cuenta).
              El nombre de la vista es el label del menú (en el Dashboard: «Asistente de IA»). */}
              <TopBar
                title={activeLabel}
                titleTestId="page-heading"
                // Atrás (S-03): retrocede en el historial del ROUTER. `location.key === 'default'`
                // marca la entrada inicial sin historial previo (deep-link directo) → cae a «/».
                onBack={() => (location.key !== 'default' ? navigate(-1) : navigate('/'))}
                onNotifications={toggleNotifications}
                notificationCount={notificationCount}
                notificationsActive={tab === 'notifications'}
                search={<FunctionSearch onNavigate={navigateTo} />}
                // Lanzador del asistente de IA: 🤖 DENTRO de la isla central, tras el título y
                // separado por un filete (← Inventario ┊ 🤖). Togglea el asistente (useAssistantStore).
                // Presente en TODAS las views, incluido el Dashboard.
                islandActions={<AssistantLauncher />}
                pageActions={<PageActionsSlot />}
                pageNav={
                  // En el lienzo del dashboard, las herramientas (Editar/Mover/Goma) viven DENTRO
                  // del topbar, en la columna izquierda (a la altura de la isla central de
                  // navegación), no en una sub-barra aparte. El resto de vistas usan su
                  // sub-navegación normal (pestañas Catálogo/Familias…).
                  tab === 'dashboard' && canvasBinding ? (
                    <CanvasToolsMenu
                      canvasRef={canvasBinding.canvasRef}
                      canUndo={canvasBinding.canvasMeta.canUndo}
                      canRedo={canvasBinding.canvasMeta.canRedo}
                      drawActive={canvasBinding.canvasMeta.drawOpen}
                      mode={canvasBinding.canvasMeta.mode}
                      zoomPct={canvasBinding.canvasMeta.zoomPct}
                    />
                  ) : (
                    <PageNavSlot />
                  )
                }
                // Solo en el dashboard: botón «+» de añadir widget (como la campana) + conmutador
                // cuadrícula↔lienzo, ambos arriba-derecha del topbar (clúster derecho).
                endSlot={
                  tab === 'dashboard' ? (
                    <>
                      <DashboardAddWidget />
                      <DashboardModeToggle />
                    </>
                  ) : undefined
                }
              />
              <div className="app-main-row">
                <main className={`bo-main${isCanvas ? ' bo-main--canvas' : ' bo-main--surface'}`}>
                  {/* Ventas vuelve a ser page propia (I-17/D-06): el dashboard ya no
                  embebe la tabla — enlaza con "Ver todas las ventas →". */}
                  {tab === 'dashboard' && (
                    <DashboardPage
                      onNavigate={navigateTo}
                      onOpenSupplierComparison={openSupplierComparison}
                    />
                  )}
                  {tab === 'sales' && (
                    <SalesHistoryPage initialStoreId={searchParams.get('store')} />
                  )}
                  {tab === 'notifications' && <NotificationsPage onResolve={{ resolveStock }} />}
                  {/* S-02 fase A: shell unificado de Inventario (Catálogo · Familias ·
                  Existencias). La vista activa vive en `?vista=`; cada segmento monta la
                  página existente con sus props de deep-link (family/store/q). */}
                  {tab === 'inventory' && (
                    <InventoryPage
                      initialFamilyId={searchParams.get('family')}
                      initialStoreId={searchParams.get('store')}
                      initialSearch={searchParams.get('q')}
                      onOpenCatalogFamily={openCatalogFamily}
                    />
                  )}
                  {tab === 'transfers' && <TransfersPage />}
                  {tab === 'promotions' && <PromotionsPage />}
                  {/* S-01: shell unificado de Personal (Equipo · Fichajes). La vista
                  activa vive en `?vista=`; cada segmento monta la página existente
                  (UsersPage / TimeClockPage) tal cual. */}
                  {tab === 'personal' && <PersonalPage />}
                  {tab === 'stores' && <StoresPage onOpenStoreView={openStoreView} />}
                  {/* S-25: la comparativa de precios es accesible en ≤1 clic vía
                  deep-link `?vista=comparativa`. Reutiliza la Tab 'suppliers': la
                  query fija la sección 'prices' en su sub-vista 'comparativa'. */}
                  {tab === 'suppliers' && (
                    <SuppliersPage
                      initialSection={searchParams.get('vista') === 'comparativa' ? 'prices' : null}
                      initialPricesView={
                        searchParams.get('vista') === 'comparativa' ? 'comparativa' : null
                      }
                    />
                  )}
                  {tab === 'verifactu' && <VerifactuPage />}
                  {/* S-21: deep-link a la subsección Tarifas (`/b2b?section=pricelists`)
                  desde el buscador. `B2bPage` valida el valor; uno inválido cae a la
                  subtab Clientes por defecto. */}
                  {tab === 'b2b' && <B2bPage initialSection={searchParams.get('section')} />}
                  {tab === 'settings' && <SettingsPage />}
                  {tab === 'help' && <HelpPage />}
                </main>
              </div>
              {/* Asistente unificado a nivel de shell, como DRAWER lateral derecho (overlay
              `position: fixed`). Presente en TODAS las views —incluidas Inventario, Ventas, Clientes
              B2B y Promociones, que antes quedaban sin asistente porque la antigua barra inferior
              chocaba con su franja inferior / layout a pantalla completa—. Al ser overlay no reflowa
              el lienzo: se superpone al borde derecho sin reescalar widgets ni tablas. Por defecto
              arranca ABIERTO en las views de trabajo y cerrado en el Dashboard; se togglea con el
              lanzador ✦ de la isla (ver AssistantDock). La vista activa define su saludo, sugerencias
              y el contexto que viaja al backend. */}
              <AssistantDock view={viewContextFor(tab)} />
            </PageHeaderProvider>
          </div>
        </div>
      </PageActionsProvider>
    </PageNavProvider>
  );
}

function AccessDenied() {
  const logout = useAuthStore((s) => s.clear);
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-[40rem] text-center" data-testid="access-denied">
        <h1 className="mb-2 text-2xl font-semibold">Acceso restringido</h1>
        <p className="mb-6 opacity-70">
          El backoffice es solo para administradores. Inicia sesión con una cuenta ADMIN.
        </p>
        <button onClick={logout} data-testid="logout" className="text-sm underline">
          Cerrar sesión
        </button>
      </div>
    </main>
  );
}

export default function App() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const getRole = useAuthStore((s) => s.getRole);
  useDevAutoLogin(accessToken === null);
  if (accessToken === null) {
    return <LoginForm onSubmit={api.login} />;
  }
  if (getRole() !== 'ADMIN') {
    return <AccessDenied />;
  }
  return <Home />;
}
