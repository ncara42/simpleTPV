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
  Clock,
  Handshake,
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

import { B2bPage } from './B2bPage.js';
import { CatalogPage } from './CatalogPage.js';
import { FamiliesPage } from './FamiliesPage.js';
import { HelpPage } from './HelpPage.js';
import { api, useAuthStore } from './lib/auth.js';
import { useDevAutoLogin } from './lib/dev-autologin.js';
import { useFeatures } from './lib/features.js';
import { switchApp } from './lib/nav.js';
import { PageHeaderProvider, usePageHeaderValue } from './lib/pageHeader.js';
import { NotificationsPage } from './NotificationsPage.js';
import { OverviewPage } from './OverviewPage.js';
import { PromotionsPage } from './PromotionsPage.js';
import { StockPage } from './StockPage.js';
import { StoresPage } from './StoresPage.js';
import { SuppliersPage } from './SuppliersPage.js';
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
  | 'suppliers'
  | 'verifactu'
  | 'b2b'
  | 'help';

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
  // Organización (D-09): Tiendas · Usuarios · Control horario
  { id: 'stores', label: 'Tiendas', icon: <Store size={18} />, group: 'org' },
  { id: 'users', label: 'Usuarios', icon: <Users size={18} />, group: 'org' },
  { id: 'timeclock', label: 'Control horario', icon: <Clock size={18} />, group: 'org' },
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

  return (
    <div className="app-shell">
      <Sidebar
        items={navItems}
        groups={NAV_GROUPS}
        groupsAsDropdowns
        activeItem={tab}
        onSelect={(id) => {
          setNavStoreId(null);
          setNavFamilyId(null);
          setTab(id as Tab);
        }}
        account={{ name: 'Administrador', subtitle: 'Central · Admin' }}
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
            {tab === 'catalog' && <CatalogPage initialFamilyId={navFamilyId} />}
            {tab === 'families' && <FamiliesPage onOpenCatalogFamily={openCatalogFamily} />}
            {tab === 'stock' && <StockPage initialStoreId={navStoreId} />}
            {tab === 'transfers' && <TransfersPage />}
            {tab === 'promotions' && <PromotionsPage />}
            {tab === 'users' && <UsersPage />}
            {tab === 'timeclock' && <TimeClockPage />}
            {tab === 'stores' && <StoresPage onOpenStoreView={openStoreView} />}
            {tab === 'suppliers' && <SuppliersPage />}
            {tab === 'verifactu' && <VerifactuPage />}
            {tab === 'b2b' && <B2bPage />}
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
  useDevAutoLogin(accessToken === null);
  if (accessToken === null) {
    return <LoginForm onSubmit={api.login} />;
  }
  if (getRole() !== 'ADMIN') {
    return <AccessDenied />;
  }
  return <Home />;
}
