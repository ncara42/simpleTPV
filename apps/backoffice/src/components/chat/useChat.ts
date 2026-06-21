import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type CanvasOp,
  type CanvasResultParams,
  type ChatConversation,
  type ChatMessage,
  type ConversationUsage,
  deleteConversation,
  type Effort,
  extractUndoableCanvasOps,
  finalizeConversation,
  getConversationUsage,
  getMessages,
  listConversations,
  listModels,
  type ModelInfo,
  pruneAfter,
  reportCanvasResult,
  streamChat,
} from '../../lib/chat.js';

// Resultado de aplicar un canvas_op en el lienzo. El consumidor (dashboard) lo devuelve y el
// hook lo reenvía al backend vía reportCanvasResult para el feedback loop del agente.
export interface CanvasApplyResult {
  accepted: boolean;
  reason?: string;
}

// ── Persistencia de preferencias ────────────────────────────────────────────────

const LS_MODEL = 'dashboard.chatModel';
const LS_EFFORT = 'dashboard.chatEffort';

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible: la preferencia simplemente no persiste */
  }
}

function isEffort(value: string | null): value is Effort {
  return value === 'low' || value === 'medium' || value === 'high';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Error inesperado al hablar con el asistente';
}

// ── Opciones y resultado del hook ────────────────────────────────────────────────

export interface UseChatOptions {
  /** Solo carga datos cuando el panel está activo (tab Dashboard visible). */
  enabled?: boolean | undefined;
  /**
   * El backend emite un canvas_op durante el stream: el dashboard lo aplica y devuelve el
   * resultado ({ accepted, reason }). El hook lo reenvía al backend (reportCanvasResult) tras
   * resolver el conversationId — clave en conversaciones nuevas, donde el id llega en `done`,
   * DESPUÉS de los canvas_op.
   */
  onCanvasOp?: ((op: CanvasOp) => CanvasApplyResult | void) | undefined;
  /** Tras prune (editar/regenerar) hay que deshacer las ops add_* del lienzo. */
  onUndoCanvasOps?: ((ops: CanvasOp[]) => void) | undefined;
  /** Snapshot FRESCO del lienzo en el momento del envío (F5): viaja en el body para el prompt. */
  getCanvasState?: (() => unknown) | undefined;
}

export interface UseChat {
  conversations: ChatConversation[];
  activeId: string | null;
  messages: ChatMessage[];
  loadingMessages: boolean;
  streaming: boolean;
  streamingText: string;
  streamingReasoning: string;
  streamingToolCalls: { id: string; name: string; args: unknown }[];
  usage: ConversationUsage | null;
  error: string | null;
  queueLength: number;
  models: ModelInfo[];
  /** True una vez resuelta la carga inicial de modelos (con o sin resultados). */
  modelsLoaded: boolean;
  model: string;
  effort: Effort;
  setModel: (model: string) => void;
  setEffort: (effort: Effort) => void;
  send: (text: string) => void;
  stop: () => void;
  regenerate: (assistantMessageId: string) => void;
  editAndResend: (userMessageId: string, newText: string) => void;
  newConversation: () => void;
  selectConversation: (id: string) => void;
  removeConversation: (id: string) => void;
  dismissError: () => void;
}

export function useChat(options: UseChatOptions = {}): UseChat {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [streamingToolCalls, setStreamingToolCalls] = useState<
    { id: string; name: string; args: unknown }[]
  >([]);
  const [usage, setUsage] = useState<ConversationUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  // Distingue «aún cargando modelos» de «cargado y vacío» (IA sin configurar en el backend):
  // sin esto, el input quedaría bloqueado en silencio y sin explicación.
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [model, setModelState] = useState<string>(() => readPref(LS_MODEL) ?? '');
  const [effort, setEffortState] = useState<Effort>(() => {
    const stored = readPref(LS_EFFORT);
    return isEffort(stored) ? stored : 'medium';
  });

  // Refs para leer el último valor dentro de callbacks/cleanup sin re-crear send.
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const streamingTextRef = useRef('');
  const abortedRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  activeIdRef.current = activeId;
  streamingTextRef.current = streamingText;

  const enabled = options.enabled ?? true;

  const setModel = useCallback((next: string) => {
    setModelState(next);
    writePref(LS_MODEL, next);
  }, []);

  const setEffort = useCallback((next: Effort) => {
    setEffortState(next);
    writePref(LS_EFFORT, next);
  }, []);

  // Recarga mensajes + uso + lista de conversaciones para una conversación dada.
  const refreshConversation = useCallback(async (conversationId: string) => {
    try {
      const [msgs, convUsage, convs] = await Promise.all([
        getMessages(conversationId),
        getConversationUsage(conversationId),
        listConversations(),
      ]);
      setMessages(msgs);
      setUsage(convUsage);
      setConversations(convs);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  // Carga inicial: modelos + conversaciones (solo cuando el panel está activo).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const [availableModels, convs] = await Promise.all([listModels(), listConversations()]);
        if (cancelled) return;
        setModels(availableModels);
        setConversations(convs);
        setModelState((current) => {
          if (current && availableModels.some((m) => m.id === current)) return current;
          const fallback = availableModels[0]?.id ?? '';
          if (fallback) writePref(LS_MODEL, fallback);
          return fallback;
        });
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        // Marca la carga como resuelta (con o sin modelos) para que la UI pueda mostrar el
        // aviso de «IA no configurada» en vez de un input bloqueado sin explicación.
        if (!cancelled) setModelsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      // Si ya hay un stream en curso, el mensaje se encola.
      if (streamingRef.current) {
        setQueue((q) => [...q, text]);
        return;
      }

      streamingRef.current = true;
      abortedRef.current = false;
      setStreaming(true);
      setError(null);
      setStreamingText('');
      streamingTextRef.current = '';
      setStreamingReasoning('');
      setStreamingToolCalls([]);

      const fromConv = activeIdRef.current;
      // Burbuja de usuario optimista (se reemplaza por el mensaje real al refrescar).
      const optimistic: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        conversationId: fromConv ?? '',
        role: 'user',
        content: [{ type: 'text', text }],
        toolCalls: null,
        toolResults: null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      const controller = new AbortController();
      abortRef.current = controller;
      let resolvedConvId: string | null = null;
      let accumulated = '';
      let accumulatedReasoning = '';
      // Resultados de cada canvas_op aplicado en el lienzo durante el turno. Se reportan al
      // backend al final, cuando ya se conoce el conversationId (en conversaciones nuevas el
      // id llega en `done`, después de los canvas_op).
      const canvasResults: CanvasResultParams[] = [];

      // Snapshot fresco del lienzo para el system prompt (F5).
      const canvasState = optionsRef.current.getCanvasState?.();
      const params = fromConv
        ? { conversationId: fromConv, message: text, model, effort, canvasState }
        : { message: text, model, effort, canvasState };

      try {
        await streamChat(
          params,
          {
            onToken: (ev) => {
              accumulated += ev.text;
              streamingTextRef.current = accumulated;
              setStreamingText(accumulated);
            },
            onReasoning: (ev) => {
              accumulatedReasoning += ev.text;
              setStreamingReasoning(accumulatedReasoning);
            },
            onToolCall: (ev) =>
              setStreamingToolCalls((prev) => [
                ...prev,
                { id: ev.id, name: ev.name, args: ev.args },
              ]),
            onCanvasOp: (ev) => {
              const res = optionsRef.current.onCanvasOp?.(ev.op);
              if (res) {
                canvasResults.push(
                  res.reason !== undefined
                    ? { toolCallId: ev.toolCallId, accepted: res.accepted, reason: res.reason }
                    : { toolCallId: ev.toolCallId, accepted: res.accepted },
                );
              }
            },
            onDone: (ev) => {
              resolvedConvId = ev.conversationId;
            },
            onError: (ev) => setError(ev.message),
          },
          controller.signal,
        );
      } catch (err) {
        if (!controller.signal.aborted) setError(errorMessage(err));
      } finally {
        abortRef.current = null;
        const target = resolvedConvId ?? fromConv;
        if (target && target !== activeIdRef.current) {
          activeIdRef.current = target;
          setActiveId(target);
        }
        // Reporta el resultado de cada canvas_op al backend (feedback loop): registra el
        // tool_result real en el historial para que el próximo turno del LLM sepa si la
        // operación se aplicó o se rechazó. No es bloqueante; un fallo no rompe el turno.
        if (target && canvasResults.length) {
          for (const r of canvasResults) {
            try {
              await reportCanvasResult(target, r);
            } catch {
              /* el reporte es best-effort: si falla, el LLM lo verá como pendiente */
            }
          }
        }
        // Si fue un Stop, stop() se encarga de finalizar y refrescar.
        if (!abortedRef.current && target) {
          await refreshConversation(target);
        }
        setStreamingText('');
        streamingTextRef.current = '';
        setStreamingReasoning('');
        setStreamingToolCalls([]);
        setStreaming(false);
        streamingRef.current = false;
      }
    },
    [model, effort, refreshConversation],
  );

  // Procesa la cola: cuando termina un stream y hay mensajes pendientes.
  useEffect(() => {
    if (streaming || queue.length === 0) return;
    const next = queue[0];
    if (next === undefined) return;
    setQueue((q) => q.slice(1));
    void send(next);
  }, [streaming, queue, send]);

  const stop = useCallback(async () => {
    const controller = abortRef.current;
    const conversationId = activeIdRef.current;
    if (!controller) return;
    abortedRef.current = true;
    controller.abort();

    if (conversationId) {
      const partial = streamingTextRef.current;
      try {
        await finalizeConversation(conversationId, {
          partialContent: partial ? [{ type: 'text', text: partial }] : [],
          model,
          effort,
        });
      } catch (err) {
        setError(errorMessage(err));
      }
      await refreshConversation(conversationId);
    }

    setStreamingText('');
    streamingTextRef.current = '';
    setStreamingReasoning('');
    setStreamingToolCalls([]);
    setStreaming(false);
    streamingRef.current = false;
  }, [model, effort, refreshConversation]);

  // Trunca el historial hasta justo antes de `userMessageId` y reenvía `text`.
  // El backend siempre añade un mensaje de usuario nuevo, así que para no duplicar
  // hay que borrar también el mensaje de usuario objetivo (prune del predecesor).
  const truncateAndResend = useCallback(
    async (userMessageId: string, text: string) => {
      const conversationId = activeIdRef.current;
      if (!conversationId || streamingRef.current) return;
      const current = messages;
      const index = current.findIndex((m) => m.id === userMessageId);
      if (index < 0) return;
      const predecessor = current[index - 1];

      try {
        if (predecessor) {
          const result = await pruneAfter(conversationId, predecessor.id);
          if (result.canvasOpsToUndo.length) {
            optionsRef.current.onUndoCanvasOps?.(result.canvasOpsToUndo);
          }
          await refreshConversation(conversationId);
        } else {
          // Primer turno: sin predecesor no se puede prune. Se deshacen las ops
          // del historial en cliente y se borra la conversación entera.
          const undoable = extractUndoableCanvasOps(current);
          if (undoable.length) optionsRef.current.onUndoCanvasOps?.(undoable);
          await deleteConversation(conversationId);
          setActiveId(null);
          activeIdRef.current = null;
          setMessages([]);
          setUsage(null);
          setConversations(await listConversations());
        }
      } catch (err) {
        setError(errorMessage(err));
        return;
      }
      void send(text);
    },
    [messages, refreshConversation, send],
  );

  const regenerate = useCallback(
    (assistantMessageId: string) => {
      const index = messages.findIndex((m) => m.id === assistantMessageId);
      if (index < 0) return;
      // El turno de usuario es el mensaje de rol 'user' inmediatamente anterior.
      let userMsg: ChatMessage | undefined;
      for (let i = index - 1; i >= 0; i -= 1) {
        const candidate = messages[i];
        if (candidate && candidate.role === 'user') {
          userMsg = candidate;
          break;
        }
      }
      if (!userMsg) return;
      const text = userMsg.content.find((b) => b.type === 'text')?.text ?? '';
      if (!text) return;
      void truncateAndResend(userMsg.id, text);
    },
    [messages, truncateAndResend],
  );

  const editAndResend = useCallback(
    (userMessageId: string, newText: string) => {
      const text = newText.trim();
      if (!text) return;
      void truncateAndResend(userMessageId, text);
    },
    [truncateAndResend],
  );

  const newConversation = useCallback(() => {
    if (streamingRef.current) return;
    setActiveId(null);
    activeIdRef.current = null;
    setMessages([]);
    setUsage(null);
    setError(null);
    setQueue([]);
  }, []);

  const selectConversation = useCallback((id: string) => {
    if (streamingRef.current) return;
    setActiveId(id);
    activeIdRef.current = id;
    setError(null);
    setLoadingMessages(true);
    void (async () => {
      try {
        const [msgs, convUsage] = await Promise.all([getMessages(id), getConversationUsage(id)]);
        setMessages(msgs);
        setUsage(convUsage);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, []);

  const removeConversation = useCallback(
    (id: string) => {
      void (async () => {
        try {
          await deleteConversation(id);
          setConversations((prev) => prev.filter((c) => c.id !== id));
          if (activeIdRef.current === id) newConversation();
        } catch (err) {
          setError(errorMessage(err));
        }
      })();
    },
    [newConversation],
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    conversations,
    activeId,
    messages,
    loadingMessages,
    streaming,
    streamingText,
    streamingReasoning,
    streamingToolCalls,
    usage,
    error,
    queueLength: queue.length,
    models,
    modelsLoaded,
    model,
    effort,
    setModel,
    setEffort,
    send: (text) => void send(text),
    stop: () => void stop(),
    regenerate,
    editAndResend,
    newConversation,
    selectConversation,
    removeConversation,
    dismissError,
  };
}
