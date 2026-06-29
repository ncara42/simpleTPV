// Estado de la Ayuda como sistema de tickets: lista (sidebar), ticket seleccionado
// con su hilo, creación, envío, cierre y respuestas de soporte en vivo por SSE
// (`support.message` / `support.closed`, identificadas por `ticketId`).
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../../lib/auth.js';
import {
  closeTicket as apiCloseTicket,
  createTicket,
  getTicketThread,
  listTickets,
  sendTicketMessage,
  type SupportMessage,
  type Ticket,
} from '../../lib/support.js';

export interface UseSupportTickets {
  tickets: Ticket[];
  selectedId: string | null;
  selected: Ticket | null;
  messages: SupportMessage[];
  pending: boolean;
  loadingThread: boolean;
  error: string | null;
  unread: ReadonlySet<string>;
  selectTicket: (id: string) => void;
  startNew: () => void;
  send: (text: string) => void;
  closeSelected: () => void;
  dismissError: () => void;
}

// Construye un SupportMessage local (optimista o derivado de una respuesta) con los
// campos que la UI necesita; los ausentes se rellenan para cumplir el tipo.
function localMessage(
  ticketId: string,
  author: SupportMessage['author'],
  body: string,
  id: string,
): SupportMessage {
  return {
    id,
    conversationId: ticketId,
    organizationId: '',
    author,
    authorUserId: null,
    body,
    telegramMessageId: null,
    createdAt: new Date().toISOString(),
  };
}

export function useSupportTickets(): UseSupportTickets {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState<Set<string>>(new Set());

  const selectedIdRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef(false);
  selectedIdRef.current = selectedId;

  const refreshTickets = useCallback(async (): Promise<void> => {
    try {
      const res = await listTickets();
      setTickets(res.tickets);
    } catch {
      setError('No se pudieron cargar tus tickets.');
    }
  }, []);

  useEffect(() => {
    void refreshTickets();
  }, [refreshTickets]);

  // Respuestas de soporte en vivo (vía Telegram) y cierres.
  useEffect(() => {
    const unsubscribe = api.subscribeEvents((event) => {
      if (event.type !== 'support.message' && event.type !== 'support.closed') return;
      const data = event.data as { ticketId?: string; messageId?: string; body?: string };
      const ticketId = data.ticketId;
      if (!ticketId) return;

      if (event.type === 'support.closed') {
        setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status: 'closed' } : t)));
        return;
      }

      // support.message: el agente respondió → ticket abierto y arriba del todo.
      const now = new Date().toISOString();
      setTickets((prev) => {
        const idx = prev.findIndex((t) => t.id === ticketId);
        const current = idx === -1 ? undefined : prev[idx];
        if (!current) {
          void refreshTickets();
          return prev;
        }
        const updated: Ticket = { ...current, status: 'open', mode: 'human', updatedAt: now };
        return [updated, ...prev.filter((_, i) => i !== idx)];
      });

      const mid = data.messageId ?? '';
      if (ticketId === selectedIdRef.current) {
        if (mid && seenIdsRef.current.has(mid)) return;
        if (mid) seenIdsRef.current.add(mid);
        setMessages((prev) => [
          ...prev,
          localMessage(ticketId, 'agent', data.body ?? '', mid || `agent-${prev.length}`),
        ]);
      } else {
        setUnread((prev) => new Set(prev).add(ticketId));
      }
    });
    return unsubscribe;
  }, [refreshTickets]);

  const selectTicket = useCallback((id: string) => {
    setSelectedId(id);
    setError(null);
    setUnread((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setLoadingThread(true);
    void getTicketThread(id)
      .then((thread) => {
        for (const m of thread.messages) seenIdsRef.current.add(m.id);
        setMessages(thread.messages);
        setTickets((prev) => prev.map((t) => (t.id === id ? thread.ticket : t)));
      })
      .catch(() => setError('No se pudo cargar el ticket.'))
      .finally(() => setLoadingThread(false));
  }, []);

  const startNew = useCallback(() => {
    setSelectedId(null);
    setMessages([]);
    setError(null);
  }, []);

  const send = useCallback((text: string) => {
    const body = text.trim();
    if (!body || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);

    const currentId = selectedIdRef.current;
    if (currentId === null) {
      // Crear ticket nuevo (el primer mensaje es el título).
      void createTicket(body)
        .then((res) => {
          setTickets((prev) => [res.ticket, ...prev]);
          setSelectedId(res.ticket.id);
          return getTicketThread(res.ticket.id);
        })
        .then((thread) => {
          for (const m of thread.messages) seenIdsRef.current.add(m.id);
          setMessages(thread.messages);
          setTickets((prev) => prev.map((t) => (t.id === thread.ticket.id ? thread.ticket : t)));
        })
        .catch(() => setError('No se pudo crear el ticket.'))
        .finally(() => {
          pendingRef.current = false;
          setPending(false);
        });
      return;
    }

    // Mensaje en un ticket existente (optimista).
    setMessages((prev) => [...prev, localMessage(currentId, 'user', body, `local-${Date.now()}`)]);
    void sendTicketMessage(currentId, body)
      .then((res) => {
        if (res.reply) {
          setMessages((prev) => [
            ...prev,
            localMessage(currentId, 'ai', res.reply ?? '', `ai-${Date.now()}`),
          ]);
        }
        setTickets((prev) => prev.map((t) => (t.id === currentId ? { ...t, mode: res.mode } : t)));
      })
      .catch(() => setError('No se pudo enviar el mensaje.'))
      .finally(() => {
        pendingRef.current = false;
        setPending(false);
      });
  }, []);

  const closeSelected = useCallback(() => {
    const id = selectedIdRef.current;
    if (!id) return;
    void apiCloseTicket(id)
      .then(() => {
        setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'closed' } : t)));
      })
      .catch(() => setError('No se pudo cerrar el ticket.'));
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  return {
    tickets,
    selectedId,
    selected,
    messages,
    pending,
    loadingThread,
    error,
    unread,
    selectTicket,
    startNew,
    send,
    closeSelected,
    dismissError,
  };
}
