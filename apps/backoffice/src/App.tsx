import '@simpletpv/ui/login.css';
import './catalog.css';

import { Button, LoginForm } from '@simpletpv/ui';
import { useState } from 'react';

import { CatalogPage } from './CatalogPage.js';
import { FamiliesPage } from './FamiliesPage.js';
import { api, useAuthStore } from './lib/auth.js';
import { SalesHistoryPage } from './SalesHistoryPage.js';
import { StoresPage } from './StoresPage.js';
import { UsersPage } from './UsersPage.js';

type Tab = 'catalog' | 'families' | 'users' | 'stores' | 'sales';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'catalog', label: 'Catálogo' },
  { id: 'families', label: 'Familias' },
  { id: 'users', label: 'Usuarios' },
  { id: 'stores', label: 'Tiendas' },
  { id: 'sales', label: 'Ventas' },
];

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const [tab, setTab] = useState<Tab>('catalog');
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto mb-6 flex max-w-[60rem] items-center justify-between">
        <h1 className="text-2xl font-semibold">simpleTPV Backoffice</h1>
        <Button variant="ghost" onClick={logout} data-testid="logout">
          Cerrar sesión
        </Button>
      </div>
      <nav className="bo-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`bo-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'catalog' && <CatalogPage />}
      {tab === 'families' && <FamiliesPage />}
      {tab === 'users' && <UsersPage />}
      {tab === 'stores' && <StoresPage />}
      {tab === 'sales' && <SalesHistoryPage />}
    </main>
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
        <Button variant="ghost" onClick={logout} data-testid="logout">
          Cerrar sesión
        </Button>
      </div>
    </main>
  );
}

export default function App() {
  // Suscrito a accessToken: getRole() lo deriva, así reacciona a login/logout.
  const accessToken = useAuthStore((s) => s.accessToken);
  const getRole = useAuthStore((s) => s.getRole);
  if (accessToken === null) {
    return (
      <LoginForm onSubmit={api.login} title="simpleTPV Backoffice" subtitle="Administración" />
    );
  }
  if (getRole() !== 'ADMIN') {
    return <AccessDenied />;
  }
  return <Home />;
}
