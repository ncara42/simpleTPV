import '@simpletpv/ui/theme.css';
import '@simpletpv/ui/theme-apple.css';
import '@simpletpv/ui/dataviz.css';
import '@simpletpv/ui/chart.css';
import './mcp-ui.css';

import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { DashboardData } from './types';
import { Breakdown } from './views/Breakdown';
import { Overview } from './views/Overview';

/**
 * Aplica el tema del host (claude.ai) al `<html>` del iframe: pone `data-theme`
 * (sobre el que cuelga la paleta oscura de `mcp-ui.css`) y `color-scheme` para los
 * controles nativos. Sin tema del host → claro por defecto. Así el panel deja de ser
 * una caja blanca fija y acompaña al chat (oscuro/claro).
 */
function applyTheme(theme?: 'light' | 'dark'): void {
  const t = theme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.dataset.theme = t;
  root.style.colorScheme = t;
}

/**
 * Punto de entrada de la MCP App. `useApp` crea/conecta el `App` y el host
 * (claude.ai) empuja el resultado de la tool por `ontoolresult`; tomamos su
 * `structuredContent` y renderizamos la vista correspondiente reusando el
 * design system del backoffice (@simpletpv/ui).
 */
function App() {
  const [data, setData] = useState<DashboardData | null>(null);

  const { app, isConnected, error } = useApp({
    appInfo: { name: 'simpletpv-dashboard', version: '1.0.0' },
    capabilities: {},
    autoResize: true,
    onAppCreated: (instance) => {
      instance.ontoolresult = (params) => {
        const sc = params.structuredContent as DashboardData | undefined;
        if (sc) setData(sc);
      };
      // Cambios de tema en caliente (el usuario alterna claro/oscuro en el chat).
      instance.onhostcontextchanged = (ctx) => applyTheme(ctx?.theme);
    },
  });

  // Tema inicial al conectar (el host context ya está disponible).
  useEffect(() => {
    if (app && isConnected) applyTheme(app.getHostContext()?.theme);
  }, [app, isConnected]);

  if (error) return <div className="mcp-state">No se pudo conectar con el panel.</div>;
  if (!data)
    return <div className="mcp-state">{isConnected ? 'Cargando datos…' : 'Conectando…'}</div>;
  return (
    <div className="mcp-app">
      {data.kind === 'overview' ? <Overview data={data} /> : <Breakdown data={data} />}
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
