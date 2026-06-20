import { api } from './auth.js';

// ── Tipos compartidos ──────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant' | 'tool';

export interface ChatConversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: ContentBlock[];
  toolCalls: ToolCall[] | null;
  toolResults: ToolResult[] | null;
  createdAt: string;
}

export interface ContentBlock {
  type: 'text' | 'thinking';
  text: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface ToolResult {
  toolCallId: string;
  content: unknown;
}

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  costEur: string; // decimal como string (Rust rust_decimal → JSON string)
}

export interface ConversationUsage {
  total: UsageSummary;
  turns: number;
}

export type CanvasOpType =
  | 'add_widget'
  | 'add_shape'
  | 'add_text'
  | 'add_note'
  | 'add_insight'
  | 'remove_element'
  | 'arrange'
  | 'set_mode'
  | 'clear_canvas';

export interface CanvasOp {
  op: CanvasOpType;
  elementId?: string;
  widgetId?: string;
  position?: string;
  period?: string;
  storeId?: string | null;
  // shape / text / note / insight
  kind?: string;
  text?: string;
  content?: string;
  // set_mode
  mode?: 'grid' | 'free';
  // generic widget
  genericSpec?: {
    type: string;
    endpoint: string;
    params?: Record<string, string>;
    fields?: Record<string, string>;
    title?: string;
    defaultSize?: { w: number; h: number };
  };
}

// ── Eventos SSE del stream ─────────────────────────────────────────────────────

export interface TokenEvent {
  text: string;
}

export interface ToolCallEvent {
  id: string;
  name: string;
  args: unknown;
}

export interface CanvasOpEvent {
  toolCallId: string;
  op: CanvasOp;
}

export interface DoneEvent {
  messageId: string;
  conversationId: string;
  usage: UsageSummary;
}

export interface ErrorEvent {
  message: string;
}

export type SseEventMap = {
  token: TokenEvent;
  tool_call: ToolCallEvent;
  canvas_op: CanvasOpEvent;
  done: DoneEvent;
  error: ErrorEvent;
};

export type SseEventType = keyof SseEventMap;

export interface ChatStreamCallbacks {
  onToken?: (ev: TokenEvent) => void;
  onToolCall?: (ev: ToolCallEvent) => void;
  onCanvasOp?: (ev: CanvasOpEvent) => void;
  onDone?: (ev: DoneEvent) => void;
  onError?: (ev: ErrorEvent) => void;
}

// ── Parámetros de stream ───────────────────────────────────────────────────────

export type Effort = 'low' | 'medium' | 'high';

export interface StreamChatParams {
  conversationId?: string; // si se omite el backend crea una nueva conversación
  message: string;
  model: string;
  effort: Effort;
  // Estado del lienzo en el momento del mensaje (F5): el backend lo incluye en el system
  // prompt para que el agente conozca qué hay en el dashboard. Forma libre.
  canvasState?: unknown;
}

// ── API calls ──────────────────────────────────────────────────────────────────

export async function streamChat(
  params: StreamChatParams,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  await api.postStream(
    '/chat/stream',
    params,
    (eventType, data) => {
      const typed = eventType as SseEventType;
      switch (typed) {
        case 'token':
          callbacks.onToken?.(data as TokenEvent);
          break;
        case 'tool_call':
          callbacks.onToolCall?.(data as ToolCallEvent);
          break;
        case 'canvas_op':
          callbacks.onCanvasOp?.(data as CanvasOpEvent);
          break;
        case 'done':
          callbacks.onDone?.(data as DoneEvent);
          break;
        case 'error':
          callbacks.onError?.(data as ErrorEvent);
          break;
      }
    },
    signal,
  );
}

export interface FinalizeParams {
  partialContent: ContentBlock[];
  model: string;
  effort: Effort;
}

export function finalizeConversation(
  conversationId: string,
  params: FinalizeParams,
): Promise<void> {
  return api.post(`/chat/conversations/${conversationId}/finalize`, params);
}

export interface CanvasResultParams {
  toolCallId: string;
  accepted: boolean;
  reason?: string;
}

export function reportCanvasResult(
  conversationId: string,
  params: CanvasResultParams,
): Promise<void> {
  return api.post(`/chat/conversations/${conversationId}/canvas-result`, params);
}

export interface PruneResult {
  pruned: number;
  canvasOpsToUndo: CanvasOp[];
}

export async function pruneAfter(conversationId: string, messageId: string): Promise<PruneResult> {
  const res = await api.fetch(`/chat/conversations/${conversationId}/after/${messageId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`pruneAfter ${res.status}`);
  return res.json() as Promise<PruneResult>;
}

export function listConversations(): Promise<ChatConversation[]> {
  return api.get<ChatConversation[]>('/chat/conversations');
}

export function getMessages(conversationId: string): Promise<ChatMessage[]> {
  return api.get<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`);
}

export function getConversationUsage(conversationId: string): Promise<ConversationUsage> {
  return api.get<ConversationUsage>(`/chat/conversations/${conversationId}/usage`);
}

export function deleteConversation(conversationId: string): Promise<void> {
  return api.del(`/chat/conversations/${conversationId}`);
}

export interface ModelInfo {
  id: string;
  provider: 'openai' | 'anthropic';
  label: string;
  supportsThinking: boolean;
}

export function listModels(): Promise<ModelInfo[]> {
  return api.get<ModelInfo[]>('/chat/models');
}

export interface OrgUsageSummary {
  totalCostEur: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Array<{ model: string; provider: string; costEur: string; turns: number }>;
}

export function getOrgUsage(from?: string, to?: string): Promise<OrgUsageSummary> {
  const q: Record<string, string> = {};
  if (from) q.from = from;
  if (to) q.to = to;
  return api.get<OrgUsageSummary>('/chat/usage', q);
}

// ── Heurística de auto-título ──────────────────────────────────────────────────
// ~6 primeras palabras significativas del primer mensaje del usuario.

const STOP_WORDS = new Set([
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'de',
  'del',
  'en',
  'a',
  'y',
  'o',
  'que',
  'se',
  'me',
  'te',
  'le',
  'lo',
  'es',
  'por',
  'con',
  'para',
  'como',
  'más',
  'si',
  'no',
  'al',
  'su',
  'sus',
]);

export function autoTitle(firstUserMessage: string, now = new Date()): string {
  const words = firstUserMessage
    .toLowerCase()
    .replace(/[¿¡.,;:!?()[\]{}""'']/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const snippet = words.slice(0, 6).join(' ');
  if (!snippet) {
    return now.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return snippet.charAt(0).toUpperCase() + snippet.slice(1);
}

// ── Canvas ops deshacibles ──────────────────────────────────────────────────────
// Solo las ops `add_*` son inversibles (espejo de `extract_canvas_ops_to_undo` del
// backend). Se usa en el caso borde de editar/regenerar el primer turno, donde no
// hay predecesor sobre el que llamar a `pruneAfter` y se borra la conversación
// entera: necesitamos extraer las ops del historial en cliente antes de borrar.

const ADD_OPS: ReadonlySet<CanvasOpType> = new Set<CanvasOpType>([
  'add_widget',
  'add_shape',
  'add_text',
  'add_note',
  'add_insight',
]);

export function extractUndoableCanvasOps(messages: ChatMessage[]): CanvasOp[] {
  const ops: CanvasOp[] = [];
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.toolCalls) continue;
    for (const call of msg.toolCalls) {
      const args = call.args;
      if (
        args !== null &&
        typeof args === 'object' &&
        'op' in args &&
        ADD_OPS.has((args as CanvasOp).op)
      ) {
        ops.push(args as CanvasOp);
      }
    }
  }
  return ops;
}
