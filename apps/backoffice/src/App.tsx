import '@simpletpv/ui/chart.css';
import '@simpletpv/ui/datatable.css';
import '@simpletpv/ui/dataviz.css';
import '@simpletpv/ui/login.css';
import '@simpletpv/ui/select.css';
import '@simpletpv/ui/topbar.css';
import './catalog.css';
import './styles.css';

import { LoginForm, type NavGroup, type NavItem, Sidebar } from '@simpletpv/ui';
import { PageHeaderProvider } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  BarChart2,
  Bell,
  CheckSquare,
  Clock,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Palette,
  Percent,
  Receipt,
  ShoppingCart,
  Store,
  Tag,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { B2bPage } from './B2bPage.js';
import { CatalogPage } from './CatalogPage.js';
import { AssistantDock } from './components/chat/AssistantDock.js';
import { FloatingActions } from './components/FloatingActions.js';
import { DashboardPage } from './DashboardPage.js';
import { FamiliesPage } from './FamiliesPage.js';
import { HelpPage } from './HelpPage.js';
import { api, useAuthStore } from './lib/auth.js';
import { useBranding } from './lib/branding.js';
import { listPendingCashMovements } from './lib/cash.js';
import { useDevAutoLogin } from './lib/dev-autologin.js';
import { useFeatures } from './lib/features.js';
import type { Tab } from './lib/nav.js';
import { listAlerts } from './lib/stock.js';
import { NotificationsPage } from './NotificationsPage.js';
import { PromotionsPage } from './PromotionsPage.js';
import { SalesHistoryPage } from './SalesHistoryPage.js';
import { SettingsPage } from './SettingsPage.js';
import { StockPage } from './StockPage.js';
import { StoresPage } from './StoresPage.js';
import { SuppliersPage } from './SuppliersPage.js';
import { TimeClockPage } from './TimeClockPage.js';
import { TransfersPage } from './TransfersPage.js';
import { UsersPage } from './UsersPage.js';
import { VerifactuPage } from './VerifactuPage.js';

// Menú de 5 entradas (D-02/D-09): Dashboard y Ayuda son pages directas; los tres
// grupos se despliegan como dropdown (hover sostenido >200ms = preview; clic =
// anclado). El mapa de contenido por grupo es el cerrado en informe_decisiones D-09.
const NAV_GROUPS: NavGroup[] = [
  { id: 'inventory', label: 'Catálogo e inventario', icon: <Package size={18} /> },
  { id: 'commercial', label: 'Ventas y clientes', icon: <Receipt size={18} /> },
  { id: 'org', label: 'Organización', icon: <Store size={18} /> },
];

const ALL_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'notifications', label: 'Notificaciones', icon: <Bell size={18} />, group: 'inventory' },
  // Catálogo e inventario (D-09): Catálogo · Familias · Stock · Traspasos · Proveedores
  { id: 'catalog', label: 'Catálogo', icon: <Package size={18} />, group: 'inventory' },
  { id: 'families', label: 'Familias', icon: <Tag size={18} />, group: 'inventory' },
  { id: 'stock', label: 'Stock', icon: <BarChart2 size={18} />, group: 'inventory' },
  { id: 'transfers', label: 'Traspasos', icon: <ArrowLeftRight size={18} />, group: 'inventory' },
  { id: 'suppliers', label: 'Proveedores', icon: <ShoppingCart size={18} />, group: 'inventory' },
  // Ventas y clientes (D-09): Ventas · Clientes B2B · Promociones
  { id: 'sales', label: 'Ventas', icon: <Receipt size={18} />, group: 'commercial' },
  { id: 'b2b', label: 'Clientes B2B', icon: <Handshake size={18} />, group: 'commercial' },
  { id: 'promotions', label: 'Promociones', icon: <Percent size={18} />, group: 'commercial' },
  // Organización (D-09 + U-08): Tiendas · Usuarios · Control horario · Ajustes
  { id: 'stores', label: 'Tiendas', icon: <Store size={18} />, group: 'org' },
  { id: 'users', label: 'Usuarios', icon: <Users size={18} />, group: 'org' },
  { id: 'timeclock', label: 'Control horario', icon: <Clock size={18} />, group: 'org' },
  { id: 'settings', label: 'Ajustes', icon: <Palette size={18} />, group: 'org' },
  { id: 'verifactu', label: 'VeriFactu', icon: <CheckSquare size={18} />, group: 'org' },
  { id: 'help', label: 'Ayuda', icon: <LifeBuoy size={18} /> },
];

// VeriFactu se mantiene fuera del menú (backend sin UI). Notificaciones también:
// su acceso es la campana de la TopBar (mismo destino y badge), así que la entrada
// del menú era redundante. Compras dejó de ser una página propia: sus secciones
// viven ahora dentro de Proveedores (P1-B). El código se conserva para reactivar
// VeriFactu/Notificaciones quitando su id de este set.
const HIDDEN_TABS = new Set<Tab>(['notifications', 'verifactu']);
const NAV: NavItem[] = ALL_NAV.filter((item) => !HIDDEN_TABS.has(item.id as Tab));

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const [tab, setTab] = useState<Tab>('dashboard');
  // Tab al que volver cuando se cierra Notificaciones desde la campana (no hay
  // router → el "volver" es explícito vía prevTab). Fallback robusto a dashboard.
  const [prevTab, setPrevTab] = useState<Tab>('dashboard');
  // La campana togglea Notificaciones: si está abierta, vuelve a la página previa;
  // si no, recuerda la actual y abre Notificaciones. Lee tab/prevTab del render
  // actual (sin updater anidado) para no chocar con la regla de hooks/setState.
  const toggleNotifications = (): void => {
    if (tab === 'notifications') {
      setTab(prevTab === 'notifications' ? 'dashboard' : prevTab);
    } else {
      setPrevTab(tab);
      setTab('notifications');
    }
  };
  // U-08: tema corporativo (color aplicado como tokens; el logo va al sidebar).
  const branding = useBranding();
  // Feature flags (#127 B): oculta del menú los módulos apagados a nivel org (el
  // backoffice es central → resolución de org). El backend sigue bloqueando con 403.
  const features = useFeatures();
  const navItems = NAV.filter((item) => {
    if (item.id === 'b2b') return features.b2b;
    if (item.id === 'timeclock') return features.time_clock;
    return true;
  });
  // Filtro de tienda preseleccionado al usar un acceso directo desde Tiendas
  // ("Ver stock"/"Ver ventas"). Se aplica al montar Stock/Ventas; la navegación
  // manual por el sidebar lo limpia para no arrastrar el filtro.
  const [navStoreId, setNavStoreId] = useState<string | null>(null);
  const openStoreView = (view: 'stock' | 'sales', storeId: string): void => {
    setNavStoreId(storeId);
    setTab(view);
  };
  // Atajo del panel de Familias (I-13): el contador navega a Catálogo filtrado.
  const [navFamilyId, setNavFamilyId] = useState<string | null>(null);
  const openCatalogFamily = (familyId: string): void => {
    setNavFamilyId(familyId);
    setTab('catalog');
  };
  // U-12: "Resolver" una notificación → Stock filtrado por tienda y producto.
  const [navSearch, setNavSearch] = useState<string | null>(null);
  const resolveStock = (storeId: string, productName: string): void => {
    setNavStoreId(storeId);
    setNavSearch(productName);
    setTab('stock');
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

  // Navegación entre pages: limpia los filtros «de paso» (tienda/familia/búsqueda) y cambia
  // de tab. La comparten el sidebar, la TopBar y el buscador de funciones (flotante o en barra).
  const navigateTo = (t: Tab): void => {
    setNavStoreId(null);
    setNavFamilyId(null);
    setNavSearch(null);
    setTab(t);
  };

  // Nombre de la view activa (el mismo label del sidebar): se pinta como etiqueta flotante
  // arriba del lienzo —donde antes vivía el chip del dashboard— sustituyendo al título del header.
  const activeLabel = ALL_NAV.find((item) => item.id === tab)?.label ?? '';
  // El Dashboard es el único lienzo libre full-bleed; el resto de views flotan como una
  // superficie sobre el fondo (se reutiliza su contenido actual, sin rediseñar cards).
  const isCanvas = tab === 'dashboard';

  return (
    <div className="app-shell">
      <Sidebar
        items={navItems}
        groups={NAV_GROUPS}
        groupsAsDropdowns
        floating
        logo={
          branding?.logoUrl ? (
            <img className="sidebar-logo-img" src={branding.logoUrl} alt="Logo" />
          ) : undefined
        }
        activeItem={tab}
        onSelect={(id) => navigateTo(id as Tab)}
        account={{ name: 'Administrador', subtitle: 'Central · Admin' }}
        onLogout={logout}
        onNotifications={toggleNotifications}
        notificationCount={notificationCount}
        // Clúster de acciones flotante sobre el sidebar (sustituye al header): lupa ⌘K + home +
        // campana + conmutador Backoffice↔TPV.
        floatingActions={
          <FloatingActions
            onNavigate={navigateTo}
            onHome={() => navigateTo('dashboard')}
            onNotifications={toggleNotifications}
            notificationCount={notificationCount}
            notificationsActive={tab === 'notifications'}
          />
        }
      />
      {/* En views NO-lienzo anulamos la columna reservada del sidebar flotante: el lienzo de
          puntitos va full-bleed y el sidebar flota por encima (como en el Dashboard). */}
      <div className={`app-content${isCanvas ? '' : ' app-content--surface'}`}>
        <PageHeaderProvider>
          {/* Nombre de la view activa, flotando arriba del contenido (reemplaza el header). */}
          {activeLabel && (
            <span className="view-title-float" data-testid="page-heading">
              {activeLabel}
            </span>
          )}
          <div className="app-main-row">
            <main className={`bo-main${isCanvas ? ' bo-main--canvas' : ' bo-main--surface'}`}>
              {/* Ventas vuelve a ser page propia (I-17/D-06): el dashboard ya no
                  embebe la tabla — enlaza con "Ver todas las ventas →". */}
              {tab === 'dashboard' && <DashboardPage onNavigate={(t) => setTab(t)} />}
              {tab === 'sales' && <SalesHistoryPage initialStoreId={navStoreId} />}
              {tab === 'notifications' && <NotificationsPage onResolve={{ resolveStock }} />}
              {tab === 'catalog' && <CatalogPage initialFamilyId={navFamilyId} />}
              {tab === 'families' && <FamiliesPage onOpenCatalogFamily={openCatalogFamily} />}
              {tab === 'stock' && (
                <StockPage initialStoreId={navStoreId} initialSearch={navSearch} />
              )}
              {tab === 'transfers' && <TransfersPage />}
              {tab === 'promotions' && <PromotionsPage />}
              {tab === 'users' && <UsersPage />}
              {tab === 'timeclock' && <TimeClockPage />}
              {tab === 'stores' && <StoresPage onOpenStoreView={openStoreView} />}
              {tab === 'suppliers' && <SuppliersPage />}
              {tab === 'verifactu' && <VerifactuPage />}
              {tab === 'b2b' && <B2bPage />}
              {tab === 'settings' && <SettingsPage />}
              {tab === 'help' && <HelpPage />}
            </main>
          </div>
          {/* Asistente unificado a nivel de shell: input + (en el Dashboard) menú «+» de
              herramientas del lienzo. Presente en TODAS las views; el binding del lienzo lo
              registra DashboardPage vía canvas-bridge. */}
          <AssistantDock />
        </PageHeaderProvider>
      </div>
    </div>
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
