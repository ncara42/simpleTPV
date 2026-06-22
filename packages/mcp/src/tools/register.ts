import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type z, type ZodRawShape } from 'zod';

import { fail, ok } from '../api.js';

/**
 * Anotaciones comunes a todas las tools del MCP. Todas son lecturas puras (no
 * mutan estado), idempotentes (mismos parámetros → mismos datos salvo el paso
 * del tiempo) y de mundo cerrado (solo hablan con la API de SimpleTPV). Marcarlas
 * así permite a los clientes (Claude Desktop / claude.ai) auto-aprobarlas sin
 * fricción y paralelizar llamadas independientes en lugar de encadenarlas.
 */
const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;

/**
 * Registra una tool de solo-lectura. Centraliza en un único sitio:
 *  - las anotaciones de solo-lectura/idempotencia,
 *  - la serialización compacta de la respuesta (vía `ok`),
 *  - el manejo uniforme de errores (vía `fail`).
 *
 * El handler devuelve los datos crudos (lo que resuelve `apiGet`); el envoltorio
 * MCP (`content`/`isError`) lo añade este helper, eliminando el boilerplate
 * `try/catch` repetido en cada tool. La firma pública de `handler` mantiene la
 * inferencia exacta de los argumentos a partir de `inputSchema` en cada llamada.
 */
export function readTool<Shape extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Shape,
  handler: (args: z.infer<z.ZodObject<Shape>>) => Promise<unknown>,
): void {
  const cb = async (args: Record<string, unknown>): Promise<CallToolResult> => {
    try {
      return ok(await handler(args as z.infer<z.ZodObject<Shape>>));
    } catch (e) {
      return fail(e);
    }
  };

  // `registerTool` resuelve el tipo del callback (`BaseToolCallback`) a partir del
  // genérico `Shape`, lo que dentro de una función genérica deja el tipo demasiado
  // abstracto y rechaza el cb pese a ser correcto en runtime. Aflojamos la firma
  // del método SOLO en esta llamada controlada; la seguridad de tipos del call-site
  // la garantiza el parámetro `handler` de arriba.
  (
    server.registerTool as (
      n: string,
      c: { description: string; inputSchema: Shape; annotations: typeof READ_ONLY },
      handlerCb: (args: Record<string, unknown>) => Promise<CallToolResult>,
    ) => void
  )(name, { description, inputSchema, annotations: READ_ONLY }, cb);
}
