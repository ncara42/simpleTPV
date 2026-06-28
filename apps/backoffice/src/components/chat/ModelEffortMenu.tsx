import './ModelEffortMenu.css';

import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Effort, ModelInfo } from '../../lib/chat.js';

const PROVIDER_LABEL: Record<ModelInfo['provider'], string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

const EFFORT_OPTIONS: { value: Effort; label: string }[] = [
  { value: 'low', label: 'Bajo' },
  { value: 'medium', label: 'Medio' },
  { value: 'high', label: 'Alto' },
];

// El backend incluye el nombre del provider en el label ("OpenAI · GPT-4.1"). Cuando se agrupa
// por provider (o para el trigger compacto) se elimina ese prefijo redundante.
function stripProviderPrefix(label: string, provider: string): string {
  const knownName = PROVIDER_LABEL[provider as ModelInfo['provider']] ?? provider;
  const prefix = `${knownName} · `;
  return label.startsWith(prefix) ? label.slice(prefix.length) : label;
}

interface ModelEffortMenuProps {
  models: ModelInfo[];
  model: string;
  onModelChange: (model: string) => void;
  effort: Effort;
  onEffortChange: (effort: Effort) => void;
}

/**
 * Selector combinado de modelo + esfuerzo, en línea en el pie del composer (estilo del
 * PromptInput de Claude): un trigger compacto «Modelo · Esfuerzo ⌄» que despliega la lista de
 * modelos y una fila «Esfuerzo» con su subpanel (Bajo/Medio/Alto). Diseño con los tokens del
 * sistema (claro); abre HACIA ARRIBA porque el composer vive abajo.
 */
export function ModelEffortMenu({
  models,
  model,
  onModelChange,
  effort,
  onEffortChange,
}: ModelEffortMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);

  // Cierra todo al pulsar Escape o hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setEffortOpen(false);
        setOpen(false);
      }
    };
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setEffortOpen(false);
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  // Modelos agrupados por proveedor; cabecera de sección solo cuando hay más de uno.
  const groups = useMemo(() => {
    const sorted = [...models].sort(
      (a, b) => a.provider.localeCompare(b.provider) || a.label.localeCompare(b.label),
    );
    const byProvider = new Map<string, ModelInfo[]>();
    for (const m of sorted) {
      const arr = byProvider.get(m.provider) ?? [];
      arr.push(m);
      byProvider.set(m.provider, arr);
    }
    return [...byProvider.entries()].map(([provider, providerModels]) => ({
      provider,
      label: PROVIDER_LABEL[provider as ModelInfo['provider']] ?? provider,
      models: providerModels,
    }));
  }, [models]);

  const multiProvider = groups.length > 1;
  const selected = models.find((m) => m.id === model);
  const triggerLabel = selected
    ? stripProviderPrefix(selected.label, selected.provider)
    : 'Modelo…';
  const effortLabel = EFFORT_OPTIONS.find((o) => o.value === effort)?.label ?? 'Bajo';

  const pickModel = (id: string): void => {
    onModelChange(id);
    setEffortOpen(false);
    setOpen(false);
  };

  const pickEffort = (value: Effort): void => {
    onEffortChange(value);
    setEffortOpen(false);
    setOpen(false);
  };

  return (
    <div className="me-menu" ref={ref}>
      <button
        type="button"
        className={`me-menu__trigger${open ? ' is-open' : ''}`}
        data-testid="chat-model-select"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Modelo y esfuerzo del asistente"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="me-menu__trigger-model">{triggerLabel}</span>
        <span className="me-menu__trigger-effort">{effortLabel}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {open && (
        <div className="me-menu__panel" role="menu" aria-label="Modelos">
          {/* Solo la lista de modelos scrollea; el panel queda con overflow visible para que el
              flyout de esfuerzo (que cuelga a la izquierda) no se recorte. */}
          <div className="me-menu__scroll">
            {groups.map((g) => (
              <div key={g.provider} className="me-menu__group">
                {multiProvider && <p className="me-menu__group-label">{g.label}</p>}
                {g.models.map((m) => {
                  const isSel = m.id === model;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSel}
                      className={`me-menu__item${isSel ? ' is-selected' : ''}`}
                      data-testid="chat-model-option"
                      onClick={() => pickModel(m.id)}
                    >
                      <span className="me-menu__item-label">
                        {stripProviderPrefix(m.label, m.provider)}
                      </span>
                      {isSel && <Check size={15} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <span className="me-menu__sep" aria-hidden="true" />

          <div className="me-menu__effort">
            <button
              type="button"
              className={`me-menu__item me-menu__item--expand${effortOpen ? ' is-open' : ''}`}
              aria-haspopup="menu"
              aria-expanded={effortOpen}
              data-testid="chat-effort-toggle"
              onClick={() => setEffortOpen((o) => !o)}
            >
              <span className="me-menu__item-label">Esfuerzo</span>
              <span className="me-menu__item-value">{effortLabel}</span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>

            {effortOpen && (
              <div className="me-menu__panel me-menu__panel--sub" role="menu" aria-label="Esfuerzo">
                <p className="me-menu__hint">
                  Un mayor esfuerzo implica respuestas más exhaustivas, pero tarda más.
                </p>
                {EFFORT_OPTIONS.map((o) => {
                  const isSel = o.value === effort;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSel}
                      className={`me-menu__item${isSel ? ' is-selected' : ''}`}
                      onClick={() => pickEffort(o.value)}
                    >
                      <span className="me-menu__item-label">{o.label}</span>
                      {o.value === 'low' && <span className="me-menu__badge">Predeterminado</span>}
                      {isSel && <Check size={15} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
