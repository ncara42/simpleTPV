// Estado del chat de Ayuda con escalado a humano. Reemplaza al hook de chat de
// analítica para esta vista: la IA triagea en el backend (`/support/chat`) y, si no
// puede, escala a Telegram; las respuestas del equipo de soporte llegan en vivo por
// el bus de eventos (`support.message`). Mismo hilo (una conversación por cliente).
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../lib/auth.js';
import { getSupportThread, sendSupportMessage, type SupportAuthor } from '../../lib/support.js';

interface LiteMessage {
  id: string;
  author: SupportAuthor;
  body: string;
}

/** Un turno del documento de Ayuda: pregunta del usuario + respuesta(s) debajo. */
export interface SupportTurn {
  id: string;
  question: string;
  answer: string;
}

export interface UseSupportChat {
  turns: SupportTurn[];
  /** Petición en vuelo (esperando respuesta de la IA o aviso de escalado). */
  pending: boolean;
  /** `human` tras escalar: una persona de soporte está al cargo. */
  mode: 'ai' | 'human';
  error: string | null;
  send: (text: string) => void;
  stop: () => void;
  dismissError: () => void;
}

// El usuario abre turno; IA y soporte (agent) se concatenan como respuesta. Un mensaje
// de soporte sin pregunta previa abre un turno con pregunta vacía.
function groupTurns(messages: LiteMessage[]): SupportTurn[] {
  const turns: SupportTurn[] = [];
  for (const m of messages) {
    if (m.author === 'user') {
      turns.push({ id: m.id, question: m.body, answer: '' });
    } else {
      const current = turns[turns.length - 1];
      if (current) {
        current.answer += current.answer ? `\n\n${m.body}` : m.body;
      } else {
        turns.push({ id: m.id, question: '', answer: m.body });
      }
    }
  }
  return turns;
}

export function useSupportChat(): UseSupportChat {
  const [messages, setMessages] = useState<LiteMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<'ai' | 'human'>('ai');
  const [error, setError] = useState<string | null>(null);

  const conversationIdRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Permite "detener" la espera: si el usuario para, ignoramos la respuesta en vuelo.
  const inflightRef = useRef(0);

  // Carga inicial del hilo (historial completo).
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

  // Respuestas de soporte (vía Telegram) en vivo, y cierre (vuelta al asistente).
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

  const send = useCallback((text: string) => {
    const body = text.trim();
    if (!body) return;
    setError(null);
    setPending(true);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, author: 'user', body }]);
    const ticket = inflightRef.current + 1;
    inflightRef.current = ticket;
    void sendSupportMessage(body)
      .then((res) => {
        if (inflightRef.current !== ticket) return; // "detenido": ignoramos la respuesta
        conversationIdRef.current = res.conversationId;
        setMode(res.mode);
        if (res.reply) {
          setMessages((prev) => [
            ...prev,
            { id: `ai-${Date.now()}`, author: 'ai', body: res.reply ?? '' },
          ]);
        }
      })
      .catch(() => {
        if (inflightRef.current === ticket) setError('No se pudo enviar el mensaje.');
      })
      .finally(() => {
        if (inflightRef.current === ticket) setPending(false);
      });
  }, []);

  const stop = useCallback(() => {
    inflightRef.current += 1; // invalida la petición en vuelo
    setPending(false);
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return {
    turns: groupTurns(messages),
    pending,
    mode,
    error,
    send,
    stop,
    dismissError,
  };
}
