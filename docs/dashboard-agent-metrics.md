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

1. Filtrar los logs de producción por `target=chat_metrics` sobre una muestra de sesiones.
2. Agregar por turno: media de `tool_rounds` y `tool_calls`; tasa de `rejected` y `hit_round_limit`.
3. Comparar la ventana **pre-v2** (composite v1) contra **post-v2**. Hipótesis: menos `rejected`
   (la reparación convierte specs imperfectas en aceptadas-con-`repaired`) y menos `tool_rounds`
   (el constrained decoding evita reintentos por schema inválido).
4. Documentar el delta aquí.

> Estado: instrumentación entregada (#210). El informe queda pendiente de una muestra de sesiones
> reales de producción.
