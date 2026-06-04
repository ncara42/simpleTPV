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
import { DEMO_CART_LINES, DEMO_USER } from './demo/demoData.js';
import { InventoryPanel } from './InventoryPanel.js';
import { isDemo } from './lib/api-config.js';
import { api, useAuthStore } from './lib/auth.js';
import { useCart } from './lib/cart.js';
import { switchApp } from './lib/nav.js';
import { listStores } from './lib/sales.js';
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

// Contexto persistente de la barra superior por vista (la tienda activa). El
// título de cada vista vive en su propio contenido, no se duplica aquí.
const EYEBROWS: Record<View, string> = {
  sale: 'Tienda Centro',
  tickets: 'Tienda Centro',
  orders: 'Tienda Centro',
  inventory: 'Tienda Centro',
  cash: 'Tienda Centro',
  clock: 'Tienda Centro',
};

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const [view, setView] = useState<View>('sale');
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const activeStore = stores[0]?.id ?? null;

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

  const eyebrow = EYEBROWS[view];

  return (
    <div className="app-shell">
      <Sidebar
        items={TPV_NAV}
        activeItem={view}
        onSelect={(id) => setView(id as View)}
        brand={{ title: 'SimpleTPV', subtitle: 'Punto de venta' }}
        account={{ name: DEMO_USER.name, subtitle: 'Centro · Dependiente' }}
        onLogout={logout}
      />
      <div className="app-content">
        <TopBar eyebrow={eyebrow} activeApp="tpv" onSwitchApp={switchApp} />
        <main className="app-main">
          {view === 'sale' && <SalePage />}
          {view === 'tickets' && <TicketsPanel storeId={activeStore} />}
          {view === 'orders' && <StoreOrderReceivePanel />}
          {view === 'inventory' && <InventoryPanel storeId={activeStore} />}
          {view === 'cash' && <CashPanel storeId={activeStore} />}
          {view === 'clock' && <TimeClockPanel storeId={activeStore} />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const isAuthed = useAuthStore((s) => s.accessToken !== null);
  if (!isAuthed) {
    return <LoginForm onSubmit={api.login} />;
  }
  return <Home />;
}
