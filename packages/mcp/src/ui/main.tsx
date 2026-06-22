import '@simpletpv/ui/theme.css';
import '@simpletpv/ui/theme-apple.css';
import '@simpletpv/ui/dataviz.css';
import '@simpletpv/ui/chart.css';
import './mcp-ui.css';

import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { DashboardData } from './types';
import { Overview } from './views/Overview';

/**
 * Punto de entrada de la MCP App. `useApp` crea/conecta el `App` y el host
 * (claude.ai) empuja el resultado de la tool por `ontoolresult`; tomamos su
 * `structuredContent` y renderizamos la vista correspondiente reusando el
 * design system del backoffice (@simpletpv/ui).
 */
function App() {
  const [data, setData] = useState<DashboardData | null>(null);

  const { isConnected, error } = useApp({
    appInfo: { name: 'simpletpv-dashboard', version: '1.0.0' },
    capabilities: {},
    autoResize: true,
    onAppCreated: (app) => {
      app.ontoolresult = (params) => {
        const sc = params.structuredContent as DashboardData | undefined;
        if (sc) setData(sc);
      };
    },
  });

  if (error) return <div className="mcp-state">No se pudo conectar con el panel.</div>;
  if (!data)
    return <div className="mcp-state">{isConnected ? 'Cargando datos…' : 'Conectando…'}</div>;
  if (data.kind === 'overview') {
    return (
      <div className="mcp-app">
        <Overview data={data} />
      </div>
    );
  }
  return <div className="mcp-state">Vista no disponible.</div>;
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
