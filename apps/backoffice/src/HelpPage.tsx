import './help.css';

import { usePageHeader } from '@simpletpv/ui';
import { ArrowUp, Loader2, Search, Square, ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  type FormEvent,
  Fragment,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ChatMarkdown } from './components/chat/ChatMarkdown.js';
import { useChat } from './components/chat/useChat.js';
import { viewContextFor } from './components/chat/view-context.js';
import type { ChatMessage } from './lib/chat.js';

// ── Modelo de presentación: el hilo plano de mensajes → turnos (pregunta + respuesta) ──────
// La vista de Ayuda lee como un documento, no como un chat: cada pregunta del usuario abre un
// turno y el texto del asistente se concatena debajo. Los mensajes `tool` no se muestran.

interface Turn {
  /** Id del mensaje de usuario que abre el turno (clave de React estable). */
  id: string;
  question: string;
  answer: string;
}

/** Texto visible de un mensaje: solo los bloques `text` (se omite el `thinking`/razonamiento). */
function textOf(message: ChatMessage): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function groupTurns(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      turns.push({ id: message.id, question: textOf(message), answer: '' });
    } else if (message.role === 'assistant') {
      const current = turns[turns.length - 1];
      if (current) current.answer += textOf(message);
    }
  }
  return turns;
}

// ── Buscador / composer ────────────────────────────────────────────────────────────────────

type AskStatus = 'ready' | 'submitted' | 'streaming';

interface HelpAskProps {
  variant: 'hero' | 'bar';
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  status: AskStatus;
  disabled: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Buscador de Ayuda: input grande centrado en reposo (`hero`) o anclado arriba en modo lectura
 * (`bar`). Es un `<form>` para que Enter envíe de forma nativa y accesible. Mientras el asistente
 * responde, el botón de enviar se convierte en «detener».
 */
function HelpAsk({
  variant,
  value,
  onChange,
  onSubmit,
  onStop,
  status,
  disabled,
  inputRef,
}: HelpAskProps) {
  const busy = status !== 'ready';
  const canSend = value.trim().length > 0 && !disabled;

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (canSend) onSubmit();
  };

  return (
    <form className={`help-ask help-ask--${variant}`} onSubmit={handleSubmit} role="search">
      <Search className="help-ask__icon" size={variant === 'hero' ? 20 : 18} aria-hidden="true" />
      <input
        ref={inputRef}
        className="help-ask__input"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={variant === 'hero' ? 'Escribe tu pregunta…' : 'Pregunta otra cosa…'}
        aria-label="Escribe tu pregunta"
        disabled={disabled}
        data-testid="help-search"
        enterKeyHint="send"
      />
      {busy ? (
        <button
          type="button"
          className="help-ask__send help-ask__send--stop"
          onClick={onStop}
          aria-label="Detener"
          title="Detener"
          data-testid="help-stop"
        >
          {status === 'submitted' ? (
            <Loader2 size={16} className="help-ask__spin" aria-hidden="true" />
          ) : (
            <Square size={15} aria-hidden="true" />
          )}
        </button>
      ) : (
        <button
          type="submit"
          className="help-ask__send"
          disabled={!canSend}
          aria-label="Enviar"
          title="Enviar"
          data-testid="help-send"
        >
          <ArrowUp size={variant === 'hero' ? 18 : 16} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}

// ── Un turno (pregunta + respuesta en modo documento) ───────────────────────────────────────

interface HelpTurnProps {
  question: string;
  answer: string;
  /** True en el turno en vivo: pinta el caret y, sin texto aún, el indicador «Pensando». */
  streaming: boolean;
}

function HelpTurn({ question, answer, streaming }: HelpTurnProps) {
  return (
    <article className="help-turn">
      <p className="help-turn__eyebrow">Tu pregunta</p>
      <h2 className="help-turn__q">{question}</h2>
      <hr className="help-rule" />
      <div className="help-answer" aria-live={streaming ? 'polite' : undefined}>
        {answer ? (
          <>
            <ChatMarkdown>{answer}</ChatMarkdown>
            {streaming && <span className="help-cursor" aria-hidden="true" />}
          </>
        ) : (
          streaming && (
            <p className="help-thinking" role="status">
              <span className="help-thinking__dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              Pensando…
            </p>
          )
        )}
      </div>
    </article>
  );
}

// ── Chips de pregunta (arranque y seguimiento), envolventes ─────────────────────────────────

interface HelpChipsProps {
  suggestions: string[];
  onPick: (text: string) => void;
}

function HelpChips({ suggestions, onPick }: HelpChipsProps) {
  return (
    <div className="help-chips">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          className="help-chip"
          onClick={() => onPick(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

// ── Pie tras una respuesta cerrada: utilidad + seguir preguntando ───────────────────────────

interface AnswerFooterProps {
  suggestions: string[];
  onSuggest: (text: string) => void;
}

function AnswerFooter({ suggestions, onSuggest }: AnswerFooterProps) {
  // Voto local (aún sin endpoint de persistencia): agradece y se queda marcado en la sesión.
  const [vote, setVote] = useState<'up' | 'down' | null>(null);

  return (
    <div className="help-foot">
      <div className="help-foot__row">
        {vote ? (
          <p className="help-helpful help-helpful--done" role="status">
            ¡Gracias por tu opinión!
          </p>
        ) : (
          <p className="help-helpful">
            ¿Te ha resultado útil?
            <button
              type="button"
              className="help-vote"
              onClick={() => setVote('up')}
              aria-label="Sí, útil"
            >
              <ThumbsUp size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="help-vote"
              onClick={() => setVote('down')}
              aria-label="No, poco útil"
            >
              <ThumbsDown size={15} aria-hidden="true" />
            </button>
          </p>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="help-followups">
          <p className="help-followups__lbl">Sigue preguntando</p>
          <HelpChips suggestions={suggestions} onPick={onSuggest} />
        </div>
      )}
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────────────────────

export function HelpPage() {
  usePageHeader('Ayuda', 'Centro de ayuda');

  const view = useMemo(() => viewContextFor('help'), []);
  const chat = useChat({ enabled: true, view: { id: view.id, label: view.label } });

  const [draft, setDraft] = useState('');
  const barInputRef = useRef<HTMLInputElement>(null);

  const turns = useMemo(() => groupTurns(chat.messages), [chat.messages]);
  const hasThread = turns.length > 0 || chat.streaming;
  const noAi = chat.modelsLoaded && chat.models.length === 0;
  const disabled = noAi || !chat.model;
  const status: AskStatus = !chat.streaming
    ? 'ready'
    : chat.streamingText || chat.streamingReasoning
      ? 'streaming'
      : 'submitted';

  const submit = (): void => {
    const text = draft.trim();
    if (!text || disabled) return;
    chat.send(text);
    setDraft('');
  };

  // Al pasar a modo lectura, el foco salta a la barra anclada para seguir preguntando sin ratón.
  useEffect(() => {
    if (hasThread) barInputRef.current?.focus();
  }, [hasThread]);

  const errorBanner = chat.error && (
    <div className="help-error" role="alert">
      <span>{chat.error}</span>
      <button type="button" onClick={chat.dismissError} aria-label="Descartar error">
        ×
      </button>
    </div>
  );

  // ── Reposo: landing centrado ──
  if (!hasThread) {
    return (
      <section className="help-page" data-testid="help-page">
        <section className="help-hero">
          <p className="help-hero-eyebrow">Centro de ayuda</p>
          <h1 className="help-hero-title">¿En qué podemos ayudarte?</h1>
          <p className="help-hero-subtitle">
            Pregunta lo que quieras sobre tu TPV y te respondo al momento. Soporte de lunes a
            viernes, de 9:00 a 19:00.
          </p>
          <HelpAsk
            variant="hero"
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            onStop={chat.stop}
            status={status}
            disabled={disabled}
          />
          {noAi ? (
            <p className="help-noai" role="status" data-testid="help-no-ai">
              El asistente no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.
            </p>
          ) : (
            <HelpChips
              suggestions={view.suggestions}
              onPick={(text) => {
                setDraft('');
                chat.send(text);
              }}
            />
          )}
          {errorBanner}
        </section>
      </section>
    );
  }

  // ── Lectura: documento + barra anclada abajo ──
  return (
    <section className="help-page help-page--reading" data-testid="help-page">
      <div className="help-doc-wrap">
        <div className="help-doc">
          {errorBanner}
          {turns.map((turn, index) => {
            const isLast = index === turns.length - 1;
            const live = isLast && chat.streaming;
            const answer = live ? chat.streamingText : turn.answer;
            return (
              <Fragment key={turn.id}>
                <HelpTurn question={turn.question} answer={answer} streaming={live} />
                {isLast && !chat.streaming && (
                  <AnswerFooter
                    suggestions={view.suggestions}
                    onSuggest={(text) => {
                      setDraft('');
                      chat.send(text);
                    }}
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
      <div className="help-askbar-outer">
        <div className="help-askbar">
          <HelpAsk
            variant="bar"
            inputRef={barInputRef}
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            onStop={chat.stop}
            status={status}
            disabled={disabled}
          />
        </div>
      </div>
    </section>
  );
}
