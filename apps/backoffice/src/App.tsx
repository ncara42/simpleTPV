import '@simpletpv/ui/chart.css';
import '@simpletpv/ui/datatable.css';
import '@simpletpv/ui/login.css';
import '@simpletpv/ui/select.css';
import '@simpletpv/ui/topbar.css';
import './catalog.css';
import './styles.css';

import { LoginForm, type NavGroup, type NavItem, Sidebar, TopBar } from '@simpletpv/ui';
import {
  ArrowLeftRight,
  BarChart2,
  Bell,
  CheckSquare,
  ClipboardCheck,
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
import { useState } from 'react';

import { ApiKeysPage } from './ApiKeysPage.js';
import { B2bPage } from './B2bPage.js';
import { CatalogPage } from './CatalogPage.js';
import { DEMO_USER } from './demo/demoData.js';
import { FamiliesPage } from './FamiliesPage.js';
import { HelpPage } from './HelpPage.js';
import { api, useAuthStore } from './lib/auth.js';
import { switchApp } from './lib/nav.js';
import { PageHeaderProvider, usePageHeaderValue } from './lib/pageHeader.js';
import { NotificationsPage } from './NotificationsPage.js';
import { OverviewPage } from './OverviewPage.js';
import { PromotionsPage } from './PromotionsPage.js';
import { PurchasesPage } from './PurchasesPage.js';
import { StockPage } from './StockPage.js';
import { StoresPage } from './StoresPage.js';
import { TimeClockPage } from './TimeClockPage.js';
import { TransfersPage } from './TransfersPage.js';
import { UsersPage } from './UsersPage.js';
import { VerifactuPage } from './VerifactuPage.js';
import { ZReportPage } from './ZReportPage.js';

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
  | 'zreport'
  | 'purchases'
  | 'verifactu'
  | 'b2b'
  | 'apikeys'
  | 'help';

// Navegación agrupada por tipo de tarea para no saturar el lateral. Dashboard va
// suelto arriba; Ayuda (Soporte) queda separada al final. "Ventas y clientes"
// reúne lo comercial (ventas, mayorista, API) frente a la gestión de la operación.
const NAV_GROUPS: NavGroup[] = [
  { id: 'inventory', label: 'Catálogo e inventario' },
  { id: 'commercial', label: 'Ventas y clientes' },
  { id: 'org', label: 'Organización' },
  { id: 'support', label: 'Soporte' },
];

const ALL_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'notifications', label: 'Notificaciones', icon: <Bell size={18} />, group: 'inventory' },
  { id: 'catalog', label: 'Catálogo', icon: <Package size={18} />, group: 'inventory' },
  { id: 'families', label: 'Arquetipos', icon: <Tag size={18} />, group: 'inventory' },
  { id: 'stock', label: 'Stock', icon: <BarChart2 size={18} />, group: 'inventory' },
  { id: 'transfers', label: 'Traspasos', icon: <ArrowLeftRight size={18} />, group: 'inventory' },
  { id: 'promotions', label: 'Promociones', icon: <Percent size={18} />, group: 'inventory' },
  { id: 'sales', label: 'Ventas', icon: <Receipt size={18} />, group: 'commercial' },
  { id: 'zreport', label: 'Cierre Z', icon: <ClipboardCheck size={18} />, group: 'commercial' },
  { id: 'b2b', label: 'Mayorista', icon: <Handshake size={18} />, group: 'commercial' },
  { id: 'apikeys', label: 'API Keys', icon: <KeyRound size={18} />, group: 'commercial' },
  { id: 'stores', label: 'Tiendas', icon: <Store size={18} />, group: 'org' },
  { id: 'users', label: 'Usuarios', icon: <Users size={18} />, group: 'org' },
  { id: 'timeclock', label: 'Control horario', icon: <Clock size={18} />, group: 'org' },
  { id: 'purchases', label: 'Compras', icon: <ShoppingCart size={18} />, group: 'commercial' },
  { id: 'verifactu', label: 'VeriFactu', icon: <CheckSquare size={18} />, group: 'org' },
  { id: 'help', label: 'Ayuda', icon: <LifeBuoy size={18} />, group: 'support' },
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
// La campana de notificaciones se retiró (informe §10): la rotura de stock ya se
// refuerza en varias zonas, así que el badge global era ruido. Sin onNotifications,
// la TopBar no renderiza la campana.
function ShellTopBar() {
  const { title, description, descriptionTestId } = usePageHeaderValue();
  return (
    <TopBar
      title={title}
      subtitle={description}
      subtitleTestId={descriptionTestId}
      activeApp="backoffice"
      onSwitchApp={switchApp}
    />
  );
}

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const [tab, setTab] = useState<Tab>('dashboard');
  // Filtro de tienda preseleccionado al usar un acceso directo desde Tiendas
  // ("Ver stock"/"Ver ventas"). Se aplica al montar Stock/Ventas; la navegación
  // manual por el sidebar lo limpia para no arrastrar el filtro.
  const [navStoreId, setNavStoreId] = useState<string | null>(null);
  const openStoreView = (view: 'stock' | 'sales', storeId: string): void => {
    setNavStoreId(storeId);
    setTab(view);
  };

  return (
    <div className="app-shell">
      <Sidebar
        items={NAV}
        groups={NAV_GROUPS}
        activeItem={tab}
        onSelect={(id) => {
          setNavStoreId(null);
          setTab(id as Tab);
        }}
        account={{ name: DEMO_USER.name, subtitle: 'Central · Admin' }}
        onLogout={logout}
      />
      <div className="app-content">
        <PageHeaderProvider>
          <ShellTopBar />
          <main className="bo-main">
            {(tab === 'dashboard' || tab === 'sales') && (
              <OverviewPage
                scrollTo={tab === 'sales' ? 'sales' : null}
                initialStoreId={navStoreId}
              />
            )}
            {tab === 'notifications' && <NotificationsPage />}
            {tab === 'catalog' && <CatalogPage />}
            {tab === 'families' && <FamiliesPage />}
            {tab === 'stock' && <StockPage initialStoreId={navStoreId} />}
            {tab === 'transfers' && <TransfersPage />}
            {tab === 'promotions' && <PromotionsPage />}
            {tab === 'users' && <UsersPage />}
            {tab === 'timeclock' && <TimeClockPage />}
            {tab === 'stores' && <StoresPage onOpenStoreView={openStoreView} />}
            {tab === 'zreport' && <ZReportPage />}
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
