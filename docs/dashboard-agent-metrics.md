# Métrica de calidad del agente del dashboard (#210)

Follow-up del EPIC dataviz #201. El verificable de F6 pedía medir, antes/después del cambio a la
**superficie v2** (el agente solo emite `block:<id>` o `gen:panel`, validados por un schema con
constrained decoding + reparación en el store), la reducción de:

- **respuestas vacías** (paneles que el agente intentó colocar y no se renderizaron), y
- **iteraciones de tool-calling** por turno.

Es una verificación **operativa** (sesiones reales), no automatizable en CI. Esta página documenta
la instrumentación que la hace medible y cómo producir el informe.

## Instrumentación (target `chat_metrics`)

Todos los eventos se emiten con `tracing` bajo el target dedicado `chat_metrics` (filtrable sin
ruido), en `crates/http/src/chat.rs`:

### `event = "turn"` — al cerrar cada turno del agente

| campo                                        | significado                                                           |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `conversation`                               | id de conversación                                                    |
| `tool_rounds`                                | iteraciones LLM→tools→LLM del turno (cota `MAX_TOOL_ROUNDS = 8`)      |
| `tool_calls`                                 | nº total de tool-calls emitidas en el turno                           |
| `canvas_ops` / `view_actions` / `data_tools` | desglose por categoría                                                |
| `hit_round_limit`                            | si se alcanzó la cota de iteraciones (señal de turno que no converge) |

### `event = "canvas_result"` — por cada resultado de canvas op (POST `/canvas-result`)

| campo                   | significado                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- |
| `conversation`          | id de conversación                                                               |
| `accepted` / `rejected` | la op se aplicó o se descartó (**rechazo = respuesta vacía**)                    |
| `repaired`              | aceptada PERO la validación reparó la spec (`accepted && reason`) — la hipótesis |
| `reason`                | motivo de reparación/rechazo (vuelve al LLM)                                     |

## Cómo producir el informe antes/después

El agregador [`apps/backoffice/src/lib/agent-metrics-report.ts`](../apps/backoffice/src/lib/agent-metrics-report.ts)
convierte una muestra de logs `chat_metrics` (formato JSON `.json()` **o** el `fmt::layer()` por
defecto) en el informe: medias de `tool_rounds`/`tool_calls`, tasa de `hit_round_limit` y, lo central
de #200, la **tasa de respuestas vacías** (`rejected`) y de `repaired`. Soporta comparar dos ventanas.

```bash
# 1. Reunir la muestra: filtrar los logs por el target chat_metrics.
grep chat_metrics produccion.log > muestra.log          # o dos ventanas: v1.log y v2.log

# 2a. Informe de una muestra:
METRICS_LOG=muestra.log pnpm --filter @simpletpv/backoffice metrics:report

# 2b. Comparativa pre-v2 vs post-v2 (escribe el markdown a un fichero):
METRICS_LOG_BEFORE=v1.log METRICS_LOG_AFTER=v2.log METRICS_OUT=docs/informe-agente.md \
  pnpm --filter @simpletpv/backoffice metrics:report
```

Sin esas variables el runner se **salta** (no corre en CI). La lógica de parseo/agregación está
cubierta por Vitest (`agent-metrics-report.test.ts`). Hipótesis a confirmar con el delta: menos
`rejected` (la reparación convierte specs imperfectas en aceptadas-con-`repaired`) y menos
`tool_rounds` (el constrained decoding del schema evita reintentos).

> Estado: instrumentación entregada (#210) y **agregador del informe entregado (#200)**. El delta
> numérico antes/después queda pendiente de una muestra de logs de sesiones reales (pre-v2 vs post-v2):
> ejecutar el comando 2b sobre esa muestra y pegar aquí la tabla resultante. La superficie v1 ya no se
> emite, así que la ventana «antes» debe provenir de logs históricos archivados.
