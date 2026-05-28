import '@simpletpv/ui/login.css';
import './catalog.css';

import { Button, LoginForm } from '@simpletpv/ui';
import { useState } from 'react';

import { CatalogPage } from './CatalogPage.js';
import { FamiliesPage } from './FamiliesPage.js';
import { api, useAuthStore } from './lib/auth.js';

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const [tab, setTab] = useState<'catalog' | 'families'>('catalog');
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto mb-6 flex max-w-[60rem] items-center justify-between">
        <h1 className="text-2xl font-semibold">simpleTPV Backoffice</h1>
        <Button variant="ghost" onClick={logout} data-testid="logout">
          Cerrar sesión
        </Button>
      </div>
      <nav className="bo-tabs">
        <button
          className={`bo-tab ${tab === 'catalog' ? 'active' : ''}`}
          onClick={() => setTab('catalog')}
          data-testid="tab-catalog"
        >
          Catálogo
        </button>
        <button
          className={`bo-tab ${tab === 'families' ? 'active' : ''}`}
          onClick={() => setTab('families')}
          data-testid="tab-families"
        >
          Familias
        </button>
      </nav>
      {tab === 'catalog' ? <CatalogPage /> : <FamiliesPage />}
    </main>
  );
}

export default function App() {
  const isAuthed = useAuthStore((s) => s.accessToken !== null);
  if (!isAuthed) {
    return (
      <LoginForm onSubmit={api.login} title="simpleTPV Backoffice" subtitle="Administración" />
    );
  }
  return <Home />;
}
