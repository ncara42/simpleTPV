import '@simpletpv/ui/login.css';

import { Button, LoginForm } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';

import { api, useAuthStore } from './lib/auth.js';

function Home() {
  const logout = useAuthStore((s) => s.clear);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api.fetch('/health');
      if (!res.ok) throw new Error(`API /health respondió ${res.status}`);
      return (await res.json()) as { status: string; uptime: number };
    },
    retry: false,
  });

  return (
    <main className="min-h-screen p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">simpleTPV Backoffice</h1>
        <Button variant="ghost" onClick={logout} data-testid="logout">
          Cerrar sesión
        </Button>
      </div>
      <section className="mt-6">
        <h2 className="text-lg font-medium">API status</h2>
        <p data-testid="api-status" className="mt-1 text-sm">
          {isLoading && 'Cargando...'}
          {isError && 'Sin conexión con API'}
          {data && `${data.status} · uptime ${Math.round(data.uptime)}s`}
        </p>
      </section>
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
