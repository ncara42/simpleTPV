import '@simpletpv/ui/alert.css';
import '@simpletpv/ui/login.css';
import '@simpletpv/ui/select.css';
import '@simpletpv/ui/topbar.css';
import './sale.css';
import './styles.css';

import { LoginForm, type NavItem, Sidebar, TopBar } from '@simpletpv/ui';
import { PageHeaderProvider, usePageHeaderValue } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  ClipboardCheck,
  Clock,
  HelpCircle,
  Moon,
  ReceiptText,
  ShoppingBag,
  Sun,
  Truck,
} from 'lucide-react';
import { useState } from 'react';

import { CashPanel } from './CashPanel.js';
import { ConnectivityBanner } from './ConnectivityBanner.js';
import { HelpPage } from './HelpPage.js';
import { InventoryPanel } from './InventoryPanel.js';
import { api, useAuthStore } from './lib/auth.js';
import { useBranding } from './lib/branding.js';
import { useDevAutoLogin } from './lib/dev-autologin.js';
import { useFeatures } from './lib/features.js';
import { formatDuration } from './lib/format.js';
import { getMe, roleLabel } from './lib/me.js';
import { switchApp } from './lib/nav.js';
import { listStores } from './lib/sales.js';
import { getTheme, type Theme, toggleTheme } from './lib/theme.js';
import { useOfflineSync } from './lib/useOfflineSync.js';
import { useTimeClock } from './lib/useTimeClock.js';
import { SalePage } from './SalePage.js';
import { StoreOrderReceivePanel } from './StoreOrderReceivePanel.js';
import { TicketsPanel } from './TicketsPanel.js';
import { TimeClockPanel } from './TimeClockPanel.js';

type View = 'sale' | 'tickets' | 'orders' | 'inventory' | 'cash' | 'clock' | 'help';

const TPV_NAV: NavItem[] = [
  { id: 'sale', label: 'Venta', icon: <ShoppingBag size={18} /> },
  { id: 'tickets', label: 'Tickets emitidos', icon: <ReceiptText size={18} /> },
  { id: 'orders', label: 'Pedidos', icon: <Truck size={18} /> },
  { id: 'inventory', label: 'Inventario', icon: <ClipboardCheck size={18} /> },
  { id: 'cash', label: 'Caja', icon: <Banknote size={18} /> },
  { id: 'clock', label: 'Fichaje', icon: <Clock size={18} /> },
  { id: 'help', label: 'Ayuda', icon: <HelpCircle size={18} /> },
];

// Toggle de tema claro/oscuro en el topbar (gemelo del de FloatingActions del
// backoffice). Reusa el acabado de botón-icono del topbar (.topbar-notif).
function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  return (
    <button
      type="button"
      className="topbar-notif"
      onClick={() => setThemeState(toggleTheme())}
      aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      data-testid="topbar-theme-toggle"
    >
      {theme === 'dark' ? (
        <Sun size={18} aria-hidden="true" />
      ) : (
        <Moon size={18} aria-hidden="true" />
      )}
    </button>
  );
}

function ShellTopBar() {
  const { title, description, descriptionTestId } = usePageHeaderValue();
  return (
    <TopBar
      title={title}
      subtitle={description}
      subtitleTestId={descriptionTestId}
      activeApp="tpv"
      onSwitchApp={switchApp}
      actions={<ThemeToggle />}
    />
  );
}

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const [view, setView] = useState<View>('sale');
  // U-08: tema corporativo compartido con el backoffice (color + logo).
  const branding = useBranding();
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const activeStore = stores[0]?.id ?? null;
  // Identidad del empleado autenticado para la cabecera (el JWT no lleva el nombre).
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });

  const queuedCount = useOfflineSync(activeStore);

  const features = useFeatures(activeStore);

  const { status, liveWorkedMs } = useTimeClock(activeStore);
  const navItems = TPV_NAV.filter((item) => item.id !== 'clock' || features.time_clock).map(
    (item) =>
      item.id === 'clock' && status !== 'OUT'
        ? { ...item, counter: formatDuration(liveWorkedMs) }
        : item,
  );

  return (
    <div className="app-shell">
      <Sidebar
        items={navItems}
        activeItem={view}
        onSelect={(id) => setView(id as View)}
        logo={
          branding?.logoUrl ? (
            <img className="sidebar-logo-img" src={branding.logoUrl} alt="Logo" />
          ) : undefined
        }
        brand={{ title: 'SimpleTPV', subtitle: 'Punto de venta' }}
        account={{ name: me?.name || 'Usuario', subtitle: roleLabel(me?.role) }}
        onLogout={logout}
      />
      <div className="app-content">
        <ConnectivityBanner queuedCount={queuedCount} />
        <PageHeaderProvider>
          <ShellTopBar />
          <main className="app-main">
            {view === 'sale' && <SalePage />}
            {view === 'tickets' && <TicketsPanel storeId={activeStore} />}
            {view === 'orders' && <StoreOrderReceivePanel />}
            {view === 'inventory' && <InventoryPanel storeId={activeStore} />}
            {view === 'cash' && <CashPanel storeId={activeStore} />}
            {view === 'clock' && <TimeClockPanel storeId={activeStore} />}
            {view === 'help' && <HelpPage />}
          </main>
        </PageHeaderProvider>
      </div>
    </div>
  );
}

export default function App() {
  const isAuthed = useAuthStore((s) => s.accessToken !== null);
  useDevAutoLogin(!isAuthed);
  if (!isAuthed) {
    return <LoginForm onSubmit={api.login} />;
  }
  return <Home />;
}
