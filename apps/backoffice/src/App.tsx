import '@simpletpv/ui/chart.css';
import '@simpletpv/ui/datatable.css';
import '@simpletpv/ui/login.css';
import '@simpletpv/ui/select.css';
import '@simpletpv/ui/topbar.css';
import './catalog.css';
import './styles.css';

import { LoginForm, type NavItem, Sidebar, TopBar } from '@simpletpv/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  BarChart2,
  Bell,
  CheckSquare,
  Clock,
  Handshake,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Percent,
  Receipt,
  ShoppingCart,
  Store,
  Tag,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { ApiKeysPage } from './ApiKeysPage.js';
import { B2bPage } from './B2bPage.js';
import { CatalogPage } from './CatalogPage.js';
import { DashboardPage } from './DashboardPage.js';
import { DEMO_USER } from './demo/demoData.js';
import { FamiliesPage } from './FamiliesPage.js';
import { HelpPage } from './HelpPage.js';
import { api, useAuthStore } from './lib/auth.js';
import { switchApp } from './lib/nav.js';
import { PageHeaderProvider, usePageHeaderValue } from './lib/pageHeader.js';
import { listAlerts } from './lib/stock.js';
import { NotificationsPage } from './NotificationsPage.js';
import { PromotionsPage } from './PromotionsPage.js';
import { PurchasesPage } from './PurchasesPage.js';
import { SalesHistoryPage } from './SalesHistoryPage.js';
import { StockPage } from './StockPage.js';
import { StoresPage } from './StoresPage.js';
import { TimeClockPage } from './TimeClockPage.js';
import { TransfersPage } from './TransfersPage.js';
import { UsersPage } from './UsersPage.js';
import { VerifactuPage } from './VerifactuPage.js';

type Tab =
  | 'dashboard'
  | 'notifications'
  | 'catalog'
  | 'families'
  | 'stock'
  | 'transfers'
  | 'promotions'
  | 'users'
  | 'timeclock'
  | 'stores'
  | 'sales'
  | 'purchases'
  | 'verifactu'
  | 'b2b'
  | 'apikeys'
  | 'help';

const ALL_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'notifications', label: 'Notificaciones', icon: <Bell size={18} /> },
  { id: 'catalog', label: 'Catálogo', icon: <Package size={18} /> },
  { id: 'families', label: 'Familias', icon: <Tag size={18} /> },
  { id: 'stock', label: 'Stock', icon: <BarChart2 size={18} /> },
  { id: 'transfers', label: 'Traspasos', icon: <ArrowLeftRight size={18} /> },
  { id: 'promotions', label: 'Promociones', icon: <Percent size={18} /> },
  { id: 'users', label: 'Usuarios', icon: <Users size={18} /> },
  { id: 'timeclock', label: 'Control horario', icon: <Clock size={18} /> },
  { id: 'stores', label: 'Tiendas', icon: <Store size={18} /> },
  { id: 'sales', label: 'Ventas', icon: <Receipt size={18} /> },
  { id: 'purchases', label: 'Compras', icon: <ShoppingCart size={18} /> },
  { id: 'verifactu', label: 'VeriFactu', icon: <CheckSquare size={18} /> },
  { id: 'b2b', label: 'Mayorista', icon: <Handshake size={18} /> },
  { id: 'apikeys', label: 'API Keys', icon: <KeyRound size={18} /> },
  { id: 'help', label: 'Ayuda', icon: <LifeBuoy size={18} /> },
];

// #106: Compras y VeriFactu se retiran del menú (decisión informe UX 2026-06-02).
// Notificaciones también sale del sidebar: su acceso es la campana de la TopBar
// (mismo destino y badge), así que la entrada del menú era redundante.
// El código (páginas, lib y datos demo) se conserva para una posible reactivación
// futura: basta con quitar el id de este set para que vuelvan a aparecer.
const HIDDEN_TABS = new Set<Tab>(['notifications', 'purchases', 'verifactu']);
const NAV: NavItem[] = ALL_NAV.filter((item) => !HIDDEN_TABS.has(item.id as Tab));

// La TopBar refleja el título y la descripción de la vista activa (publicados por
// cada página vía usePageHeader). Sustituye al antiguo eyebrow fijo «Administración»:
// el contexto de área ya lo da el conmutador Backoffice/TPV de la derecha.
// La campana de notificaciones lleva al portal de Notificaciones (mismo destino
// que la entrada del sidebar) y comparte su badge de contador.
function ShellTopBar({
  notificationCount,
  notificationsActive,
  onNotifications,
}: {
  notificationCount: number;
  notificationsActive: boolean;
  onNotifications: () => void;
}) {
  const { title, description, descriptionTestId } = usePageHeaderValue();
  return (
    <TopBar
      title={title}
      subtitle={description}
      subtitleTestId={descriptionTestId}
      activeApp="backoffice"
      onSwitchApp={switchApp}
      onNotifications={onNotifications}
      notificationCount={notificationCount}
      notificationsActive={notificationsActive}
    />
  );
}

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('dashboard');

  // Contador de notificaciones (alertas de stock): alimenta el badge de la campana
  // de la TopBar. Comparte queryKey con NotificationsPage.
  const { data: alerts = [] } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: () => listAlerts(),
  });
  // Anti-rotura por arquetipo (IT-13): el badge de la campana cuenta solo roturas
  // CRÍTICAS (sin sustituto en la familia). Las degradadas (hay sustituto) no alarman.
  const alertCount = alerts.filter((a) => a.severity === 'critical').length;

  // Tiempo real (#33): el SSE refresca el contador aunque no estés en Notificaciones.
  useEffect(() => {
    const unsubscribe = api.subscribeEvents((event) => {
      if (event.type === 'alert.created') {
        void qc.invalidateQueries({ queryKey: ['stock-alerts'] });
      }
    });
    return unsubscribe;
  }, [qc]);

  return (
    <div className="app-shell">
      <Sidebar
        items={NAV}
        activeItem={tab}
        onSelect={(id) => setTab(id as Tab)}
        account={{ name: DEMO_USER.name, subtitle: 'Central · Admin' }}
        onLogout={logout}
      />
      <div className="app-content">
        <PageHeaderProvider>
          <ShellTopBar
            notificationCount={alertCount}
            notificationsActive={tab === 'notifications'}
            onNotifications={() => setTab('notifications')}
          />
          <main className="bo-main">
            {tab === 'dashboard' && <DashboardPage />}
            {tab === 'notifications' && <NotificationsPage />}
            {tab === 'catalog' && <CatalogPage />}
            {tab === 'families' && <FamiliesPage />}
            {tab === 'stock' && <StockPage />}
            {tab === 'transfers' && <TransfersPage />}
            {tab === 'promotions' && <PromotionsPage />}
            {tab === 'users' && <UsersPage />}
            {tab === 'timeclock' && <TimeClockPage />}
            {tab === 'stores' && <StoresPage />}
            {tab === 'sales' && <SalesHistoryPage />}
            {tab === 'purchases' && <PurchasesPage />}
            {tab === 'verifactu' && <VerifactuPage />}
            {tab === 'b2b' && <B2bPage />}
            {tab === 'apikeys' && <ApiKeysPage />}
            {tab === 'help' && <HelpPage />}
          </main>
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
  if (accessToken === null) {
    return <LoginForm onSubmit={api.login} />;
  }
  if (getRole() !== 'ADMIN') {
    return <AccessDenied />;
  }
  return <Home />;
}
