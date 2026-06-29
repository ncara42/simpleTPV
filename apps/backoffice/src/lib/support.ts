// Cliente del soporte con escalado a humano (Ayuda). La IA triagea en el backend;
// si no puede resolver, escala a Telegram y la persona de soporte responde, lo que
// llega a la web por el bus de eventos SSE (`support.message`).
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

export interface SupportConversation {
  id: string;
  organizationId: string;
  telegramTopicId: number | null;
  mode: 'ai' | 'human';
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportThread {
  conversation: SupportConversation;
  messages: SupportMessage[];
}

export interface SupportChatResponse {
  escalated: boolean;
  mode: 'ai' | 'human';
  reply?: string;
  conversationId: string;
}

export function getSupportThread(): Promise<SupportThread> {
  return api.get<SupportThread>('/support/messages');
}

export function sendSupportMessage(message: string): Promise<SupportChatResponse> {
  return api.post<SupportChatResponse>('/support/chat', { message });
}
