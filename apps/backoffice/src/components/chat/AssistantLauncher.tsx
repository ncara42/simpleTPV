import { Bot } from 'lucide-react';

import { useAssistantStore } from '../../lib/assistant-store.js';

// Lanzador del asistente de IA: icon-button 🤖 que vive en la ISLA central de la TopBar, junto al
// buscador ⌘K (zona «buscar/pedir»). Presente en TODAS las views, incluido el Dashboard. Togglea
// la ventana flotante (useAssistantStore); el estado `open` se refleja como `is-active` + aria-pressed.
// Reusa `.topbar-icon-btn` para igualar a los demás controles de la isla (atrás · tema · campana).
export function AssistantLauncher() {
  const open = useAssistantStore((s) => s.open);
  const toggle = useAssistantStore((s) => s.toggle);

  return (
    <button
      type="button"
      className={`topbar-icon-btn${open ? ' is-active' : ''}`}
      onClick={toggle}
      aria-label={open ? 'Cerrar asistente de IA' : 'Abrir asistente de IA'}
      aria-pressed={open}
      title="Asistente de IA"
      data-testid="assistant-launcher"
    >
      <Bot size={18} aria-hidden="true" />
    </button>
  );
}
