import { Select, type SelectOption } from '@simpletpv/ui';
import { History, Plus, X } from 'lucide-react';
import { useMemo } from 'react';

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

interface ChatHeaderProps {
  models: ModelInfo[];
  model: string;
  onModelChange: (model: string) => void;
  effort: Effort;
  onEffortChange: (effort: Effort) => void;
  showHistory: boolean;
  onToggleHistory: () => void;
  onNewConversation: () => void;
  onClose: () => void;
}

export function ChatHeader({
  models,
  model,
  onModelChange,
  effort,
  onEffortChange,
  showHistory,
  onToggleHistory,
  onNewConversation,
  onClose,
}: ChatHeaderProps) {
  // Agrupados por provider: se ordenan por provider y se etiquetan con su prefijo.
  const modelOptions = useMemo<SelectOption[]>(() => {
    const sorted = [...models].sort(
      (a, b) => a.provider.localeCompare(b.provider) || a.label.localeCompare(b.label),
    );
    return sorted.map((m) => ({
      value: m.id,
      label: `${PROVIDER_LABEL[m.provider]} · ${m.label}`,
    }));
  }, [models]);

  return (
    <header className="chat-header">
      <Select
        value={model}
        onChange={onModelChange}
        options={modelOptions}
        placeholder="Modelo…"
        ariaLabel="Modelo del asistente"
        className="chat-header__model"
        data-testid="chat-model-select"
      />

      <div className="chat-effort" role="radiogroup" aria-label="Esfuerzo de razonamiento">
        {EFFORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={effort === opt.value}
            className={`chat-effort__btn chat-effort__btn--${opt.value}${
              effort === opt.value ? ' is-active' : ''
            }`}
            onClick={() => onEffortChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="chat-header__actions">
        <button
          type="button"
          className={`chat-icon-btn${showHistory ? ' is-active' : ''}`}
          onClick={onToggleHistory}
          aria-pressed={showHistory}
          aria-label="Historial"
          title="Historial"
        >
          <History size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="chat-icon-btn"
          onClick={onNewConversation}
          aria-label="Nueva conversación"
          title="Nueva conversación"
        >
          <Plus size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="chat-icon-btn"
          onClick={onClose}
          aria-label="Cerrar"
          title="Cerrar"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
