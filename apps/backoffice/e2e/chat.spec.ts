import { expect, test } from '@playwright/test';

import { gotoApp, navTo, selectByLabel } from './helpers.js';

// F3.3 (#188): integración del ChatPanel en el shell del backoffice. Tests estructurales —
// el panel aparece solo en Dashboard, colapsa/expande y su estado persiste entre recargas.
// El envío real de mensajes con streaming (requiere provider LLM) se cubre en F6 con un
// provider fake; aquí solo verificamos la integración y el layout.

// El colapso del panel se persiste en localStorage (dashboard.chatCollapsed) y el storageState
// se comparte entre tests: parte siempre de expandido para un estado conocido.
test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => localStorage.removeItem('dashboard.chatCollapsed'));
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
});

test('el ChatPanel aparece solo en la pestaña Dashboard', async ({ page }) => {
  // En Dashboard el panel está montado y expandido por defecto.
  await expect(page.getByTestId('chat-panel')).toBeVisible();

  // Al navegar a otra pestaña, el panel se desmonta por completo (ni panel ni rail).
  await navTo(page, 'stock');
  await expect(page.getByTestId('chat-panel')).toHaveCount(0);
  await expect(page.getByTestId('chat-rail')).toHaveCount(0);

  // Al volver al Dashboard, reaparece.
  await navTo(page, 'dashboard');
  await expect(page.getByTestId('chat-panel')).toBeVisible();
});

test('colapsar y expandir el panel persiste entre recargas', async ({ page }) => {
  await expect(page.getByTestId('chat-panel')).toBeVisible();

  // Colapsar: el panel deja paso al rail de iconos.
  await page.getByRole('button', { name: 'Colapsar panel' }).click();
  await expect(page.getByTestId('chat-rail')).toBeVisible();
  await expect(page.getByTestId('chat-panel')).toHaveCount(0);

  // El colapso persiste tras recargar.
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('chat-rail')).toBeVisible();
  await expect(page.getByTestId('chat-panel')).toHaveCount(0);

  // Expandir desde el rail y verificar que también persiste.
  await page.getByRole('button', { name: 'Abrir asistente' }).click();
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('chat-panel')).toBeVisible();
});

test('el panel expone el selector de modelo y el campo de mensaje', async ({ page }) => {
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  // Controles clave del panel presentes (sin enviar: el streaming real es de F6).
  await expect(page.getByTestId('chat-model-select')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeVisible();
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
  // El panel cargó los modelos del backend real en el beforeEach (antes del mock);
  // recargamos para que `listModels` use el mock y se auto-seleccione un modelo, lo
  // que habilita el input (`disabled={!chat.model}`).
  await page.reload();
  await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 15000 });
  await expect(page.getByPlaceholder('Escribe un mensaje…')).toBeEnabled({ timeout: 10000 });
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
  const input = page.getByPlaceholder('Escribe un mensaje…');
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
  await expect(page.locator('.chat-bubble--assistant')).toContainText('tus ventas van bien.');
});

// Nota (F6): el render de chips de tool_call y la aplicación de canvas_op (puente
// agente→lienzo) se cubren de forma DETERMINISTA en unit tests — `chat.test.ts`
// (streamChat enruta tool_call/canvas_op a sus callbacks) y `dashboard-store.test.ts`
// (applyCanvasOp añade/valida widgets). No se replican aquí como E2E porque dependen
// de estado transitorio de streaming y del reload post-turno (asserts propensos a
// flakiness, desaconsejados por las reglas de testing web).

test('permite cambiar de proveedor/modelo y de esfuerzo', async ({ page }) => {
  await mockChat(
    page,
    sse([
      {
        event: 'done',
        data: {
          messageId: 'm',
          conversationId: 'c',
          usage: { inputTokens: 1, outputTokens: 1, costEur: '0' },
        },
      },
    ]),
  );

  // El selector (custom) de modelo ofrece los providers mockeados.
  await selectByLabel(page, 'chat-model-select', 'Anthropic · Claude Opus 4.8');
  await expect(page.getByTestId('chat-model-select')).toContainText('Claude Opus 4.8');

  // El toggle de esfuerzo (radiogroup Bajo/Medio/Alto) es seleccionable.
  await page.getByRole('radio', { name: 'Alto' }).click();
  await expect(page.getByRole('radio', { name: 'Alto' })).toBeChecked();
});
