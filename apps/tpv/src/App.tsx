import '@simpletpv/ui/login.css';
import './sale.css';
import './styles.css';

import { LoginForm, type NavItem, Sidebar } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Banknote, RotateCcw, ShoppingBag } from 'lucide-react';
import { useState } from 'react';

import { BlindReturnPanel } from './BlindReturnPanel.js';
import { CashPanel } from './CashPanel.js';
import { api, useAuthStore } from './lib/auth.js';
import { listStores } from './lib/sales.js';
import { ReturnPanel } from './ReturnPanel.js';
import { SalePage } from './SalePage.js';
import { TransferReceivePanel } from './TransferReceivePanel.js';

type View = 'sale' | 'return' | 'transfers' | 'cash';

const TPV_NAV: NavItem[] = [
  { id: 'sale', label: 'Venta', icon: <ShoppingBag size={18} /> },
  { id: 'return', label: 'Devolución', icon: <RotateCcw size={18} /> },
  { id: 'transfers', label: 'Traspasos', icon: <ArrowLeftRight size={18} /> },
  { id: 'cash', label: 'Caja', icon: <Banknote size={18} /> },
];

function ReturnsView() {
  const [mode, setMode] = useState<'ticket' | 'blind'>('ticket');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1 w-fit">
        <button
          className={[
            'h-8 rounded-md px-3 text-sm font-medium transition-colors',
            mode === 'ticket'
              ? 'bg-neutral-900 text-white'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800',
          ].join(' ')}
          onClick={() => setMode('ticket')}
          data-testid="return-mode-ticket"
        >
          Con ticket
        </button>
        <button
          className={[
            'h-8 rounded-md px-3 text-sm font-medium transition-colors',
            mode === 'blind'
              ? 'bg-neutral-900 text-white'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800',
          ].join(' ')}
          onClick={() => setMode('blind')}
          data-testid="return-mode-blind"
        >
          Sin ticket
        </button>
      </div>
      {mode === 'ticket' ? <ReturnPanel /> : <BlindReturnPanel />}
    </div>
  );
}

function CashView() {
  const { data: stores = [] } = useQuery({ queryKey: ['stores'], queryFn: listStores });
  const storeId = stores[0]?.id ?? null;
  return <CashPanel storeId={storeId} />;
}

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const [view, setView] = useState<View>('sale');

  return (
    <div className="app-shell">
      <Sidebar
        items={TPV_NAV}
        activeItem={view}
        onSelect={(id) => setView(id as View)}
        onLogout={logout}
      />
      <div className="app-content">
        <main className="p-4">
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
