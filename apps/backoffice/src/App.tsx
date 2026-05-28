import '@simpletpv/ui/login.css';
import './catalog.css';

import { Button, LoginForm } from '@simpletpv/ui';

import { CatalogPage } from './CatalogPage.js';
import { api, useAuthStore } from './lib/auth.js';

function Home() {
  const logout = useAuthStore((s) => s.clear);
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto mb-8 flex max-w-[60rem] items-center justify-between">
        <h1 className="text-2xl font-semibold">simpleTPV Backoffice</h1>
        <Button variant="ghost" onClick={logout} data-testid="logout">
          Cerrar sesión
        </Button>
      </div>
      <CatalogPage />
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
