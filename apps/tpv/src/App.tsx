import '@simpletpv/ui/login.css';
import './sale.css';

import { Button, LoginForm } from '@simpletpv/ui';

import { api, useAuthStore } from './lib/auth.js';
import { SalePage } from './SalePage.js';

function Home() {
  const logout = useAuthStore((s) => s.clear);
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto mb-5 flex max-w-[64rem] items-center justify-between">
        <h1 className="text-2xl font-semibold">simpleTPV</h1>
        <Button variant="ghost" onClick={logout} data-testid="logout">
          Cerrar sesión
        </Button>
      </div>
      <SalePage />
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
