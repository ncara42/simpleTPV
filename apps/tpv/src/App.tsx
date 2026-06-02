import '@simpletpv/ui/login.css';
import '@simpletpv/ui/topbar.css';
import './sale.css';
import './styles.css';

import { LoginForm, type NavItem, Sidebar, TopBar } from '@simpletpv/ui';
import { ArrowLeftRight, Banknote, RotateCcw, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CashView } from './CashPanel.js';
import { DEMO_CART_LINES, DEMO_USER } from './demo/demoData.js';
import { api, useAuthStore } from './lib/auth.js';
import { useCart } from './lib/cart.js';
import { switchApp } from './lib/nav.js';
import { ReturnsView } from './ReturnPanel.js';
import { SalePage } from './SalePage.js';
import { TransferReceivePanel } from './TransferReceivePanel.js';

type View = 'sale' | 'return' | 'transfers' | 'cash';

const TPV_NAV: NavItem[] = [
  { id: 'sale', label: 'Venta', icon: <ShoppingBag size={18} /> },
  { id: 'return', label: 'Devolución', icon: <RotateCcw size={18} /> },
  { id: 'transfers', label: 'Traspasos', icon: <ArrowLeftRight size={18} /> },
  { id: 'cash', label: 'Caja', icon: <Banknote size={18} /> },
];

const TITLES: Record<View, { eyebrow: string; title: string }> = {
  sale: { eyebrow: 'Tienda Centro', title: 'Venta' },
  return: { eyebrow: 'Tienda Centro', title: 'Devolución' },
  transfers: { eyebrow: 'Tienda Centro', title: 'Recepción de traspasos' },
  cash: { eyebrow: 'Tienda Centro', title: 'Caja' },
};

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const [view, setView] = useState<View>('sale');

  // Precarga del carrito demo: solo la primera vez (al montar) para que
  // "Ticket actual" aparezca con las 3 líneas del mockup al entrar. Lee el
  // estado actual de la store directamente para no depender de `items`.
  useEffect(() => {
    if (useCart.getState().items.length === 0) {
      useCart.setState({
        items: DEMO_CART_LINES.map((l) => ({ ...l, discountPct: 0 })),
        ticketDiscountPct: 0,
        ticketDiscountAmt: 0,
      });
    }
  }, []);

  const { eyebrow, title } = TITLES[view];

  return (
    <div className="app-shell">
      <Sidebar
        items={TPV_NAV}
        activeItem={view}
        onSelect={(id) => setView(id as View)}
        brand={{ title: 'SimpleTPV', subtitle: 'Punto de venta' }}
        user={{ name: DEMO_USER.name, subtitle: 'Centro · Dependiente' }}
      />
      <div className="app-content">
        <TopBar
          eyebrow={eyebrow}
          title={title}
          activeApp="tpv"
          onSwitchApp={switchApp}
          onLogout={logout}
        />
        <main className="app-main">
          {view === 'sale' && <SalePage />}
          {view === 'return' && <ReturnsView />}
          {view === 'transfers' && <TransferReceivePanel />}
          {view === 'cash' && <CashView />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const isAuthed = useAuthStore((s) => s.accessToken !== null);
  if (!isAuthed) {
    return <LoginForm onSubmit={api.login} subtitle="Punto de venta" />;
  }
  return <Home />;
}
