// Cliente del soporte (Ayuda) — sistema de tickets. La IA triagea en el backend; si
// no puede resolver, escala a Telegram y la persona de soporte responde, lo que llega
// a la web por el bus de eventos SSE (`support.message` con `ticketId`).
import { api } from './auth.js';

export type SupportAuthor = 'user' | 'ai' | 'agent';

export interface SupportMessage {
  id: string;
  conversationId: string;
  organizationId: string;
  author: SupportAuthor;
  authorUserId: string | null;
  body: string;
  telegramMessageId: number | null;
  createdAt: string;
}

export interface Ticket {
  id: string;
  organizationId: string;
  number: number | null;
  title: string | null;
  authorUserId: string | null;
  telegramTopicId: number | null;
  mode: 'ai' | 'human';
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface TurnResult {
  escalated: boolean;
  mode: 'ai' | 'human';
  reply?: string;
}

export interface CreatedTicket extends TurnResult {
  ticket: Ticket;
}

export interface TicketThread {
  ticket: Ticket;
  messages: SupportMessage[];
}

export function listTickets(): Promise<{ tickets: Ticket[] }> {
  return api.get<{ tickets: Ticket[] }>('/support/tickets');
}

export function createTicket(message: string): Promise<CreatedTicket> {
  return api.post<CreatedTicket>('/support/tickets', { message });
}

export function getTicketThread(id: string): Promise<TicketThread> {
  return api.get<TicketThread>(`/support/tickets/${id}/messages`);
}

export function sendTicketMessage(id: string, message: string): Promise<TurnResult> {
  return api.post<TurnResult>(`/support/tickets/${id}/messages`, { message });
}

export function closeTicket(id: string): Promise<void> {
  return api.post<void>(`/support/tickets/${id}/close`);
}
