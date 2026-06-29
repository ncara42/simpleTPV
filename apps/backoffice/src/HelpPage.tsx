import './help.css';

import { usePageHeader } from '@simpletpv/ui';
import { ArrowUp, Loader2, Search, Square, ThumbsDown, ThumbsUp } from 'lucide-react';
import { type FormEvent, Fragment, type RefObject, useEffect, useRef, useState } from 'react';

import { ChatMarkdown } from './components/chat/ChatMarkdown.js';
import { viewContextFor } from './components/chat/view-context.js';
import { useSupportChat } from './components/support/useSupportChat.js';

// La vista de Ayuda lee como un documento: cada pregunta del usuario abre un turno y la
// respuesta (de la IA o, tras escalar, del equipo de soporte) se concatena debajo. El
// agrupado en turnos vive en `useSupportChat`.

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
  /** True en el turno en vivo sin respuesta aún: pinta el indicador «Pensando». */
  streaming: boolean;
}

function HelpTurn({ question, answer, streaming }: HelpTurnProps) {
  return (
    <article className="help-turn">
      {question ? (
        <>
          <p className="help-turn__eyebrow">Tu pregunta</p>
          <h2 className="help-turn__q">{question}</h2>
          <hr className="help-rule" />
        </>
      ) : null}
      <div className="help-answer" aria-live={streaming ? 'polite' : undefined}>
        {answer ? (
          <ChatMarkdown>{answer}</ChatMarkdown>
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

  const view = viewContextFor('help');
  const chat = useSupportChat();

  const [draft, setDraft] = useState('');
  const barInputRef = useRef<HTMLInputElement>(null);

  const turns = chat.turns;
  const hasThread = turns.length > 0 || chat.pending;
  const status: AskStatus = chat.pending ? 'submitted' : 'ready';

  const submit = (): void => {
    const text = draft.trim();
    if (!text) return;
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

  // Aviso de que una persona de soporte está al cargo (tras escalar).
  const humanBanner = chat.mode === 'human' && (
    <p className="help-human" role="status" data-testid="help-human">
      Estás hablando con nuestro equipo de soporte. Te responderemos por aquí.
    </p>
  );

  // ── Reposo: landing centrado ──
  if (!hasThread) {
    return (
      <section className="help-page" data-testid="help-page">
        <section className="help-hero">
          <p className="help-hero-eyebrow">Centro de ayuda</p>
          <h1 className="help-hero-title">¿En qué podemos ayudarte?</h1>
          <p className="help-hero-subtitle">
            Pregunta lo que quieras sobre tu TPV y te respondo al momento. Si no puedo resolverlo,
            lo derivo a una persona del equipo. Soporte de lunes a viernes, de 9:00 a 19:00.
          </p>
          <HelpAsk
            variant="hero"
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            onStop={chat.stop}
            status={status}
            disabled={false}
          />
          <HelpChips
            suggestions={view.suggestions}
            onPick={(text) => {
              setDraft('');
              chat.send(text);
            }}
          />
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
          {humanBanner}
          {errorBanner}
          {turns.map((turn, index) => {
            const isLast = index === turns.length - 1;
            const live = isLast && chat.pending && !turn.answer;
            return (
              <Fragment key={turn.id}>
                <HelpTurn question={turn.question} answer={turn.answer} streaming={live} />
                {isLast && !chat.pending && chat.mode === 'ai' && (
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
            disabled={false}
          />
        </div>
      </div>
    </section>
  );
}
