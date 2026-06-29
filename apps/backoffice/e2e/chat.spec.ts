import { expect, test } from '@playwright/test';

import { gotoApp, navTo } from './helpers.js';

// Rediseño del asistente: dock inferior unificado (input + menú «+» de herramientas) que
// sustituye al panel lateral (FAB + glass). El dock es permanente en Dashboard; la conversación
// vive en un popover que se despliega ENCIMA del input bajo demanda. Tests estructurales — el
// envío real con streaming se cubre más abajo con un provider simulado (route interception).

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
});

test('el dock del asistente está presente en todas las views; el «+» de lienzo solo en Dashboard', async ({
  page,
}) => {
  // En el Dashboard («Asistente de IA») el composer es el HÉROE: el dock está montado, con el
  // menú «+» de herramientas del lienzo, y el panel de conversación es PERMANENTE (centrado).
  await expect(page.getByTestId('chat-dock')).toBeVisible();
  await expect(page.getByTestId('dash-free-tools')).toBeVisible();
  await expect(page.getByTestId('chat-panel')).toBeVisible();

  // Al navegar a otra view, el dock SIGUE presente pero hace morph a la BARRA compacta: sin el «+»
  // (esa view no tiene lienzo) y con el panel cerrado por defecto (popover bajo demanda).
  await navTo(page, 'stock');
  await expect(page.getByTestId('chat-dock')).toBeVisible();
  await expect(page.getByTestId('dash-free-tools')).toHaveCount(0);
  await expect(page.getByTestId('chat-panel')).toHaveCount(0);

  // Al volver al Dashboard, reaparecen el «+» y el panel héroe permanente.
  await navTo(page, 'dashboard');
  await expect(page.getByTestId('chat-dock')).toBeVisible();
  await expect(page.getByTestId('dash-free-tools')).toBeVisible();
  await expect(page.getByTestId('chat-panel')).toBeVisible();
});

test('el popover de conversación se abre desde la barra y se cierra (views compactas)', async ({
  page,
}) => {
  // El popover bajo demanda es comportamiento de la BARRA compacta (fuera del Dashboard, donde el
  // panel es permanente). En Existencias el dock está compactado: panel cerrado por defecto.
  await navTo(page, 'stock');
  await expect(page.getByTestId('chat-dock')).toBeVisible();
  await expect(page.getByTestId('chat-panel')).toHaveCount(0);

  // Abrir la conversación desde el botón de la barra.
  await page.getByTestId('chat-toggle-panel').click();
  await expect(page.getByTestId('chat-panel')).toBeVisible();

  // Cerrar con la × de la cabecera vuelve a dejar solo la barra.
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByTestId('chat-panel')).toHaveCount(0);
  await expect(page.getByTestId('chat-dock')).toBeVisible();
});

// Mockea solo la lista de modelos (y conversaciones vacías) y recarga para que el panel use
// el mock — el backend real del E2E no tiene claves de IA, así que sin esto `/chat/models`
// devuelve []. Patrón de reload idéntico al de `mockChat`.
async function mockModels(page: import('@playwright/test').Page, models: unknown[]): Promise<void> {
  await page.route('**/api/chat/models', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(models) }),
  );
  await page.route('**/api/chat/conversations', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
}

test('el dock expone el input y el botón de enviar en el pie', async ({ page }) => {
  // Con IA configurada (modelos disponibles) la barra muestra el input habilitado y el botón de
  // enviar en el pie.
  await mockModels(page, MODELS);
  await expect(page.getByTestId('chat-dock')).toBeVisible();
  await expect(page.getByTestId('chat-input')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();
});

test('sin proveedor de IA configurado, el panel avisa y el input queda deshabilitado', async ({
  page,
}) => {
  await mockModels(page, []);
  await expect(page.getByTestId('chat-dock')).toBeVisible();
  // El input queda deshabilitado (sin proveedor no se puede enviar).
  await expect(page.getByTestId('chat-input')).toBeDisabled();
  // En el Dashboard el panel héroe es permanente: el aviso de IA no configurada se ve directamente
  // (no hay que abrir popover) en vez de bloquear sin más.
  await expect(page.getByTestId('chat-no-ai')).toBeVisible();
});

// ── Streaming con provider simulado (route interception) ────────────────────────
// El backend LLM se mockea interceptando /api/chat/** para que los tests sean
// deterministas y no dependan de OpenAI/Anthropic. Se prueba el cableado real del
// frontend: parseo SSE, render de tokens, chips de tool_call y aplicación de canvas_op.

const MODELS = [
  { id: 'gpt-4.1', provider: 'openai', label: 'OpenAI · GPT-4.1', supportsThinking: false },
  {
    id: 'claude-opus-4-8',
    provider: 'anthropic',
    label: 'Anthropic · Claude Opus 4.8',
    supportsThinking: true,
  },
];

/** Construye un cuerpo SSE a partir de eventos `{ event, data }`. */
function sse(events: Array<{ event: string; data: unknown }>): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

type PersistedMsg = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'tool';
  content: Array<{ type: string; text: string }>;
  toolCalls: Array<{ id: string; name: string; args: unknown }> | null;
  toolResults: Array<{ toolCallId: string; content: unknown }> | null;
  createdAt: string;
};

/**
 * Mockea todos los endpoints /api/chat/** ; `streamBody` es el SSE de /chat/stream.
 * `persisted` es lo que devuelve GET .../messages: tras `done`, el hook recarga la
 * conversación, así que las aserciones estables van contra el historial persistido
 * (no contra el estado transitorio de streaming, que se limpia al terminar el turno).
 */
async function mockChat(
  page: import('@playwright/test').Page,
  streamBody: string,
  persisted: PersistedMsg[] = [],
) {
  await page.route('**/api/chat/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    if (url.includes('/chat/stream') && method === 'POST') {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
        body: streamBody,
      });
    }
    if (url.includes('/chat/models')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MODELS),
      });
    }
    if (url.endsWith('/chat/conversations')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (url.includes('/usage')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: { inputTokens: 5, outputTokens: 3, costEur: '0.0001' },
          turns: 1,
        }),
      });
    }
    if (url.includes('/messages')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(persisted),
      });
    }
    // canvas-result / finalize / otros POST → 204.
    return route.fulfill({ status: 204, body: '' });
  });
  // El dock cargó los modelos del backend real en el beforeEach (antes del mock);
  // recargamos para que `listModels` use el mock y se auto-seleccione un modelo, lo
  // que habilita el input (`disabled={!chat.model}`).
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('chat-input')).toBeEnabled({ timeout: 10000 });
}

function userMsg(conv: string, text: string): PersistedMsg {
  return {
    id: `u-${conv}`,
    conversationId: conv,
    role: 'user',
    content: [{ type: 'text', text }],
    toolCalls: null,
    toolResults: null,
    createdAt: '2026-06-20T10:00:00.000Z',
  };
}

function assistantMsg(
  conv: string,
  text: string,
  toolCalls: PersistedMsg['toolCalls'] = null,
  toolResults: PersistedMsg['toolResults'] = null,
): PersistedMsg {
  return {
    id: `a-${conv}`,
    conversationId: conv,
    role: 'assistant',
    content: [{ type: 'text', text }],
    toolCalls,
    toolResults,
    createdAt: '2026-06-20T10:00:01.000Z',
  };
}

async function sendMessage(page: import('@playwright/test').Page, text: string) {
  const input = page.getByTestId('chat-input');
  await input.fill(text);
  await page.getByRole('button', { name: 'Enviar' }).click();
}

test('hace streaming de la respuesta del asistente', async ({ page }) => {
  await mockChat(
    page,
    sse([
      { event: 'token', data: { text: 'Hola, ' } },
      { event: 'token', data: { text: 'tus ventas van bien.' } },
      {
        event: 'done',
        data: {
          messageId: 'm1',
          conversationId: 'c1',
          usage: { inputTokens: 5, outputTokens: 3, costEur: '0.0001' },
        },
      },
    ]),
    [userMsg('c1', 'cómo van las ventas'), assistantMsg('c1', 'tus ventas van bien.')],
  );

  await sendMessage(page, 'cómo van las ventas');
  // Tras el turno, el hilo muestra el mensaje del usuario y la respuesta del asistente.
  await expect(page.locator('.chat-bubble--user')).toContainText('cómo van las ventas');
  await expect(page.locator('.chat-response')).toContainText('tus ventas van bien.');
});

// Nota (F6): el render de chips de tool_call y la aplicación de canvas_op (puente
// agente→lienzo) se cubren de forma DETERMINISTA en unit tests — `chat.test.ts`
// (streamChat enruta tool_call/canvas_op a sus callbacks) y `dashboard-store.test.ts`
// (applyCanvasOp añade/valida widgets). No se replican aquí como E2E porque dependen
// de estado transitorio de streaming y del reload post-turno (asserts propensos a
// flakiness, desaconsejados por las reglas de testing web).
