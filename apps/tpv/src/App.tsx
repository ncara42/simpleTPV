import { Button } from '@simpletpv/ui';
import { useQuery } from '@tanstack/react-query';

import { pingHealth } from './lib/api.js';

export default function App() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: pingHealth,
    retry: false,
  });

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">simpleTPV</h1>
      <p className="mt-2 text-sm text-gray-600">Punto de venta — scaffolding</p>
      <section className="mt-6">
        <h2 className="text-lg font-medium">API status</h2>
        <p data-testid="api-status" className="mt-1 text-sm">
          {isLoading && 'Cargando...'}
          {isError && 'Sin conexión con API'}
          {data && `${data.status} · uptime ${Math.round(data.uptime)}s`}
        </p>
        <Button className="mt-3">Botón placeholder</Button>
      </section>
    </main>
  );
}
