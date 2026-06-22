import '@simpletpv/ui/chart.css';
import '@simpletpv/ui/datatable.css';
import '@simpletpv/ui/dataviz.css';
import '@simpletpv/ui/login.css';
import '@simpletpv/ui/multiselect.css';
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
import type { ReactNode } from 'react';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

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
import {
  NAV_GROUPS,
  NAV_NODES,
  type NavGroupId,
  nodeOf,
  pathToTab,
  singleStoreParam,
  tabToPath,
} from './lib/navigation.js';
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

// Iconos del menú por id de pestaña. Viven en el shell (no en `navigation.ts`, que es
// datos puros) para no acoplar la fuente única a lucide/React.
const NAV_ICONS: Record<Tab, ReactNode> = {
  dashboard: <LayoutDashboard size={18} />,
  notifications: <Bell size={18} />,
  catalog: <Package size={18} />,
  families: <Tag size={18} />,
  stock: <BarChart2 size={18} />,
  transfers: <ArrowLeftRight size={18} />,
  suppliers: <ShoppingCart size={18} />,
  sales: <Receipt size={18} />,
  b2b: <Handshake size={18} />,
  promotions: <Percent size={18} />,
  stores: <Store size={18} />,
  users: <Users size={18} />,
  timeclock: <Clock size={18} />,
  settings: <Palette size={18} />,
  verifactu: <CheckSquare size={18} />,
  help: <LifeBuoy size={18} />,
};

const GROUP_ICONS: Record<NavGroupId, ReactNode> = {
  inventory: <Package size={18} />,
  commercial: <Receipt size={18} />,
  org: <Store size={18} />,
};

// Grupos para el Sidebar (fuente única `NAV_GROUPS` + iconos del shell).
const SIDEBAR_GROUPS: NavGroup[] = NAV_GROUPS.map((g) => ({
  id: g.id,
  label: g.label,
  icon: GROUP_ICONS[g.id],
}));

// Layout del shell flotante (sustituye al antiguo header): Sidebar flotante +
// clúster de acciones flotante (lupa ⌘K + home + campana + switch) + título de view
// flotante + lienzo con <Outlet/> + asistente global. La navegación es por ruta:
// `activeItem` y el título se derivan de `useLocation()`.
function ShellLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((s) => s.clear);
  // U-08: tema corporativo (color como tokens; el logo va al sidebar).
  const branding = useBranding();
  // Feature flags (#127 B): oculta del menú los módulos apagados a nivel org. El
  // backend sigue bloqueando con 403; las rutas apagadas redirigen (ver <FlagRoute>).
  const features = useFeatures();

  // Pestaña activa derivada de la URL (null en rutas desconocidas → dashboard).
  const tab: Tab = pathToTab(location.pathname) ?? 'dashboard';
  const isNotifications = tab === 'notifications';

  // U-11/D-17: badge de la campana = roturas de stock activas + solicitudes de caja
  // pendientes (#146). Mismas queryKeys que Notificaciones (refresca con su SSE).
  const { data: alerts = [] } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: () => listAlerts(),
  });
  const { data: pendingCash = [] } = useQuery({
    queryKey: ['pending-cash-movements'],
    queryFn: () => listPendingCashMovements(),
  });
  const notificationCount = alerts.length + pendingCash.length;

  // Items del menú desde la fuente única: oculta los `hidden` y los flags apagados.
  const navItems: NavItem[] = NAV_NODES.filter((n) => !n.hidden)
    .filter((n) => !n.flag || features[n.flag])
    .map((n) => ({
      id: n.id,
      label: n.label,
      icon: NAV_ICONS[n.id],
      ...(n.group ? { group: n.group } : {}),
    }));

  // La campana togglea Notificaciones: si está abierta, vuelve atrás (con fallback a
  // dashboard si no hay historial interno); si no, navega a /notifications.
  const toggleNotifications = (): void => {
    if (isNotifications) {
      if (window.history.length > 1) navigate(-1);
      else navigate('/');
    } else {
      navigate('/notifications');
    }
  };

  // Nombre de la view activa (el mismo label del sidebar): etiqueta flotante arriba
  // del lienzo, sustituye al título del header.
  const activeLabel = nodeOf(tab)?.label ?? '';
  // El Dashboard es el único lienzo libre full-bleed; el resto flota como superficie.
  const isCanvas = tab === 'dashboard';

  return (
    <div className="app-shell">
      <Sidebar
        items={navItems}
        groups={SIDEBAR_GROUPS}
        groupsAsDropdowns
        floating
        logo={
          branding?.logoUrl ? (
            <img className="sidebar-logo-img" src={branding.logoUrl} alt="Logo" />
          ) : undefined
        }
        activeItem={tab}
        onSelect={(id) => navigate(tabToPath(id as Tab))}
        account={{ name: 'Administrador', subtitle: 'Central · Admin' }}
        onLogout={logout}
        onNotifications={toggleNotifications}
        notificationCount={notificationCount}
        floatingActions={
          <FloatingActions
            onNavigate={(t) => navigate(tabToPath(t))}
            onHome={() => navigate('/')}
            onNotifications={toggleNotifications}
            notificationCount={notificationCount}
            notificationsActive={isNotifications}
          />
        }
      />
      {/* En views NO-lienzo anulamos la columna reservada del sidebar flotante: el
          lienzo va full-bleed y el sidebar flota por encima. */}
      <div className={`app-content${isCanvas ? '' : ' app-content--surface'}`}>
        <PageHeaderProvider>
          {activeLabel && (
            <span className="view-title-float" data-testid="page-heading">
              {activeLabel}
            </span>
          )}
          <div className="app-main-row">
            <main className={`bo-main${isCanvas ? ' bo-main--canvas' : ' bo-main--surface'}`}>
              <Outlet />
            </main>
          </div>
          {/* Asistente unificado a nivel de shell; presente en TODAS las views. */}
          <AssistantDock />
        </PageHeaderProvider>
      </div>
    </div>
  );
}

// ── Contenedores de ruta: leen los deep-links de la URL y alimentan los `initial*`
// de las pages hoja (que conservan sus props sin cambios). ──────────────────────

function DashboardRoute() {
  const navigate = useNavigate();
  return <DashboardPage onNavigate={(t) => navigate(tabToPath(t))} />;
}

function StockRoute() {
  const [params] = useSearchParams();
  return (
    <StockPage
      initialStoreId={singleStoreParam(params.get('store'))}
      initialSearch={params.get('q')}
    />
  );
}

function SalesRoute() {
  const [params] = useSearchParams();
  return <SalesHistoryPage initialStoreId={singleStoreParam(params.get('store'))} />;
}

function CatalogRoute() {
  const [params] = useSearchParams();
  return <CatalogPage initialFamilyId={params.get('family')} />;
}

function FamiliesRoute() {
  const navigate = useNavigate();
  return (
    <FamiliesPage onOpenCatalogFamily={(familyId) => navigate(`/catalog?family=${familyId}`)} />
  );
}

function StoresRoute() {
  const navigate = useNavigate();
  return <StoresPage onOpenStoreView={(view, storeId) => navigate(`/${view}?store=${storeId}`)} />;
}

function NotificationsRoute() {
  const navigate = useNavigate();
  const resolveStock = (storeId: string, productName: string): void => {
    navigate(`/stock?store=${storeId}&q=${encodeURIComponent(productName)}`);
  };
  return <NotificationsPage onResolve={{ resolveStock }} />;
}

// Ruta condicionada por feature flag: si está apagado, redirige a dashboard (el
// backend igualmente bloquea con 403). Coherente con el filtrado del menú.
function FlagRoute({ flag, children }: { flag: 'b2b' | 'time_clock'; children: ReactNode }) {
  const features = useFeatures();
  return features[flag] ? <>{children}</> : <Navigate to="/" replace />;
}

function Home() {
  return (
    <Routes>
      <Route element={<ShellLayout />}>
        <Route index element={<DashboardRoute />} />
        <Route path="catalog" element={<CatalogRoute />} />
        <Route path="families" element={<FamiliesRoute />} />
        <Route path="stock" element={<StockRoute />} />
        <Route path="transfers" element={<TransfersPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="sales" element={<SalesRoute />} />
        <Route
          path="b2b"
          element={
            <FlagRoute flag="b2b">
              <B2bPage />
            </FlagRoute>
          }
        />
        <Route path="promotions" element={<PromotionsPage />} />
        <Route path="stores" element={<StoresRoute />} />
        <Route path="users" element={<UsersPage />} />
        <Route
          path="timeclock"
          element={
            <FlagRoute flag="time_clock">
              <TimeClockPage />
            </FlagRoute>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="help" element={<HelpPage />} />
        {/* Ocultas del menú (HIDDEN_TABS) pero accesibles por URL. */}
        <Route path="notifications" element={<NotificationsRoute />} />
        <Route path="verifactu" element={<VerifactuPage />} />
        {/* Ruta no encontrada → dashboard. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
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
