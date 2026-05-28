import '@simpletpv/ui/login.css';
import './sale.css';

import { Button, LoginForm } from '@simpletpv/ui';
import { useState } from 'react';

import { api, useAuthStore } from './lib/auth.js';
import { ReturnPanel } from './ReturnPanel.js';
import { SalePage } from './SalePage.js';

function Home() {
  const logout = useAuthStore((s) => s.clear);
  // Pestaña activa: venta (por defecto) o devolución. No estorba el flujo de
  // venta — la devolución es una vista aparte a la que se accede con el botón.
  const [view, setView] = useState<'sale' | 'return'>('sale');
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
          <Button variant="ghost" onClick={logout} data-testid="logout">
            Cerrar sesión
          </Button>
        </div>
      </div>
      {view === 'sale' ? <SalePage /> : <ReturnPanel />}
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
