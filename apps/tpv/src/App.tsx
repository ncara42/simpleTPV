import '@simpletpv/ui/alert.css';
import '@simpletpv/ui/login.css';
import '@simpletpv/ui/select.css';
import '@simpletpv/ui/topbar.css';
import './sale.css';
import './styles.css';

import { LoginForm, type NavItem, Sidebar, TopBar } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import { Banknote, ClipboardCheck, Clock, ReceiptText, ShoppingBag, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CashPanel } from './CashPanel.js';
import { ConnectivityBanner } from './ConnectivityBanner.js';
import { DEMO_CART_LINES, DEMO_USER } from './demo/demoData.js';
import { InventoryPanel } from './InventoryPanel.js';
import { isDemo } from './lib/api-config.js';
import { api, useAuthStore } from './lib/auth.js';
import { useCart } from './lib/cart.js';
import { useFeatures } from './lib/features.js';
import { formatDuration } from './lib/format.js';
import { switchApp } from './lib/nav.js';
import { PageHeaderProvider, usePageHeaderValue } from './lib/pageHeader.js';
import { listStores } from './lib/sales.js';
import { useOfflineSync } from './lib/useOfflineSync.js';
import { useTimeClock } from './lib/useTimeClock.js';
import { SalePage } from './SalePage.js';
import { StoreOrderReceivePanel } from './StoreOrderReceivePanel.js';
import { TicketsPanel } from './TicketsPanel.js';
import { TimeClockPanel } from './TimeClockPanel.js';

type View = 'sale' | 'tickets' | 'orders' | 'inventory' | 'cash' | 'clock';

const TPV_NAV: NavItem[] = [
  { id: 'sale', label: 'Venta', icon: <ShoppingBag size={18} /> },
  { id: 'tickets', label: 'Tickets emitidos', icon: <ReceiptText size={18} /> },
  { id: 'orders', label: 'Pedidos', icon: <Truck size={18} /> },
  { id: 'inventory', label: 'Inventario', icon: <ClipboardCheck size={18} /> },
  { id: 'cash', label: 'Caja', icon: <Banknote size={18} /> },
  { id: 'clock', label: 'Fichaje', icon: <Clock size={18} /> },
];

// La TopBar refleja el título y la descripción de la vista activa (publicados por
// cada vista vía usePageHeader, igual que el backoffice).
function ShellTopBar() {
  const { title, description, descriptionTestId } = usePageHeaderValue();
  return (
    <TopBar
      title={title}
      subtitle={description}
      subtitleTestId={descriptionTestId}
      activeApp="tpv"
      onSwitchApp={switchApp}
    />
  );
}

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const [view, setView] = useState<View>('sale');
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const activeStore = stores[0]?.id ?? null;

  // Venta offline (offline slice 2c): reserva bloque de tickets con conexión,
  // sincroniza la cola al reconectar y expone el nº de ventas pendientes. En demo
  // no hay backend, así que se desactiva (storeId null → no-op).
  const queuedCount = useOfflineSync(isDemo() ? null : activeStore);

  // Feature flags (#127 B): resuelve a nivel de la tienda activa. Oculta 'Fichaje'
  // si el control horario está apagado (el backend también bloquea con 403).
  const features = useFeatures(activeStore);

  // El item "Fichaje" del sidebar muestra el temporizador del turno en vivo
  // mientras hay jornada activa; si no, solo su icono y etiqueta.
  const { status, liveWorkedMs } = useTimeClock(activeStore);
  const navItems = TPV_NAV.filter((item) => item.id !== 'clock' || features.time_clock).map(
    (item) =>
      item.id === 'clock' && status !== 'OUT'
        ? { ...item, counter: formatDuration(liveWorkedMs) }
        : item,
  );

  // Precarga del carrito demo: solo la primera vez (al montar) para que
  // "Ticket actual" aparezca con las 3 líneas del mockup al entrar. Lee el
  // estado actual de la store directamente para no depender de `items`.
  useEffect(() => {
    // Solo en modo demo: en real el carrito arranca vacío (los productId demo no
    // existen en el backend y romperían la venta).
    if (isDemo() && useCart.getState().items.length === 0) {
      useCart.setState({
        items: DEMO_CART_LINES.map((l) => ({ ...l, discountPct: 0, discountAmt: 0 })),
        ticketDiscountPct: 0,
        ticketDiscountAmt: 0,
      });
    }
  }, []);

  return (
    <div className="app-shell">
      <Sidebar
        items={navItems}
        activeItem={view}
        onSelect={(id) => setView(id as View)}
        brand={{ title: 'SimpleTPV', subtitle: 'Punto de venta' }}
        account={{ name: DEMO_USER.name, subtitle: 'Centro · Dependiente' }}
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
          </main>
        </PageHeaderProvider>
      </div>
    </div>
  );
}

export default function App() {
  const isAuthed = useAuthStore((s) => s.accessToken !== null);
  if (!isAuthed) {
    return (
      <LoginForm
        onSubmit={api.login}
        {...(isDemo() ? { initialEmail: 'demo@simpletpv.com', initialPassword: 'demo' } : {})}
      />
    );
  }
  return <Home />;
}
