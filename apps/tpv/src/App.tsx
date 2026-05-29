import '@simpletpv/ui/login.css';
import './sale.css';

import { Button, LoginForm } from '@simpletpv/ui';
import { useState } from 'react';

import { BlindReturnPanel } from './BlindReturnPanel.js';
import { api, useAuthStore } from './lib/auth.js';
import { ReturnPanel } from './ReturnPanel.js';
import { SalePage } from './SalePage.js';
import { TransferReceivePanel } from './TransferReceivePanel.js';

// Vista de devoluciones: alterna entre devolución contra ticket y sin ticket (#59).
function ReturnsView() {
  const [mode, setMode] = useState<'ticket' | 'blind'>('ticket');
  return (
    <div>
      <div className="tpv-nav" style={{ marginBottom: '1rem' }}>
        <button
          className={`tpv-tab ${mode === 'ticket' ? 'active' : ''}`}
          onClick={() => setMode('ticket')}
          data-testid="return-mode-ticket"
        >
          Con ticket
        </button>
        <button
          className={`tpv-tab ${mode === 'blind' ? 'active' : ''}`}
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

function Home() {
  const logout = useAuthStore((s) => s.clear);
  // Pestaña activa: venta (por defecto), devolución o recepción de traspasos. No
  // estorban el flujo de venta — son vistas aparte a las que se accede por botón.
  const [view, setView] = useState<'sale' | 'return' | 'transfers'>('sale');
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto mb-5 flex max-w-[64rem] items-center justify-between">
        <h1 className="text-2xl font-semibold">simpleTPV</h1>
        <div className="tpv-nav">
          <button
            className={`tpv-tab ${view === 'sale' ? 'active' : ''}`}
            onClick={() => setView('sale')}
            data-testid="tab-sale"
          >
            Venta
          </button>
          <button
            className={`tpv-tab ${view === 'return' ? 'active' : ''}`}
            onClick={() => setView('return')}
            data-testid="tab-return"
          >
            Devolución
          </button>
          <button
            className={`tpv-tab ${view === 'transfers' ? 'active' : ''}`}
            onClick={() => setView('transfers')}
            data-testid="tab-transfers"
          >
            Traspasos
          </button>
          <Button variant="ghost" onClick={logout} data-testid="logout">
            Cerrar sesión
          </Button>
        </div>
      </div>
      {view === 'sale' && <SalePage />}
      {view === 'return' && <ReturnsView />}
      {view === 'transfers' && <TransferReceivePanel />}
    </main>
  );
}

export default function App() {
  const isAuthed = useAuthStore((s) => s.accessToken !== null);
  if (!isAuthed) {
    return <LoginForm onSubmit={api.login} subtitle="Punto de venta" />;
  }
  return <Home />;
}
