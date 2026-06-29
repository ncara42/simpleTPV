import { LifeBuoy, Send, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { api } from '../../lib/auth.js';
import { getSupportThread, sendSupportMessage, type SupportAuthor } from '../../lib/support.js';
import { ChatMarkdown } from '../chat/ChatMarkdown.js';

// Un mensaje en la UI. Reutilizamos la forma del backend pero solo necesitamos
// estos campos para pintar; el `id` puede ser temporal (optimista) hasta refrescar.
interface UiMessage {
  id: string;
  author: SupportAuthor;
  body: string;
}

function authorLabel(author: SupportAuthor): string {
  if (author === 'user') return 'Tú';
  if (author === 'agent') return 'Soporte';
  return 'Asistente';
}

export function SupportChat() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<'ai' | 'human'>('ai');
  const [error, setError] = useState<string | null>(null);

  // Refs para el callback SSE (vive fuera del ciclo de render): conversación activa
  // e ids ya vistos (evita duplicar si el stream reentrega tras una reconexión).
  const conversationIdRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  // Carga inicial del hilo (historial completo: usuario, asistente y soporte).
  useEffect(() => {
    let active = true;
    void getSupportThread()
      .then((thread) => {
        if (!active) return;
        conversationIdRef.current = thread.conversation.id;
        setMode(thread.conversation.mode);
        for (const m of thread.messages) seenIdsRef.current.add(m.id);
        setMessages(thread.messages.map((m) => ({ id: m.id, author: m.author, body: m.body })));
      })
      .catch(() => {
        if (active) setError('No se pudo cargar la conversación de soporte.');
      });
    return () => {
      active = false;
    };
  }, []);

  // Suscripción al bus de eventos: las respuestas de soporte (vía Telegram) llegan
  // como `support.message`; `support.closed` devuelve la conversación al asistente.
  useEffect(() => {
    const unsubscribe = api.subscribeEvents((event) => {
      if (event.type === 'support.closed') {
        if (event.data.conversationId === conversationIdRef.current) setMode('ai');
        return;
      }
      if (event.type !== 'support.message') return;
      const data = event.data as { conversationId?: string; messageId?: string; body?: string };
      if (data.conversationId !== conversationIdRef.current) return;
      const id = data.messageId ?? '';
      if (id && seenIdsRef.current.has(id)) return;
      if (id) seenIdsRef.current.add(id);
      setMode('human');
      setMessages((prev) => [
        ...prev,
        { id: id || `agent-${prev.length}`, author: 'agent', body: data.body ?? '' },
      ]);
    });
    return unsubscribe;
  }, []);

  // Auto-scroll al fondo cuando llegan mensajes.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);
    // Burbuja optimista del usuario.
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, author: 'user', body: text }]);
    setInput('');
    try {
      const res = await sendSupportMessage(text);
      conversationIdRef.current = res.conversationId;
      setMode(res.mode);
      // La IA respondió o nos dio el aviso de escalado: lo mostramos como asistente.
      if (res.reply) {
        setMessages((prev) => [
          ...prev,
          { id: `ai-${Date.now()}`, author: 'ai', body: res.reply ?? '' },
        ]);
      }
    } catch {
      setError('No se pudo enviar el mensaje. Inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <section className="help-section support-chat" data-testid="support-chat">
      <header className="help-section-head">
        <h3 className="help-title">
          <LifeBuoy size={18} aria-hidden="true" /> Chat de soporte
        </h3>
        <p className="help-intro">
          {mode === 'human'
            ? 'Estás hablando con nuestro equipo de soporte. Te responderemos por aquí.'
            : 'Pregúntanos lo que necesites. Si no puedo resolverlo, derivo tu consulta a una persona.'}
        </p>
      </header>

      <div className="support-log" ref={listRef} data-testid="support-log">
        {messages.length === 0 ? (
          <p className="support-empty">¿En qué te podemos ayudar?</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`support-msg support-msg--${m.author}`}>
              <span className="support-msg-author">
                {m.author === 'agent' ? <UserRound size={13} aria-hidden="true" /> : null}
                {authorLabel(m.author)}
              </span>
              <div className="support-msg-body">
                {m.author === 'user' ? m.body : <ChatMarkdown>{m.body}</ChatMarkdown>}
              </div>
            </div>
          ))
        )}
      </div>

      {error ? (
        <p className="support-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="support-composer">
        <textarea
          className="support-input"
          placeholder="Escribe tu mensaje…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={sending}
          data-testid="support-input"
        />
        <button
          type="button"
          className="support-send"
          onClick={() => void handleSend()}
          disabled={sending || input.trim() === ''}
          aria-label="Enviar"
          data-testid="support-send"
        >
          <Send size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
