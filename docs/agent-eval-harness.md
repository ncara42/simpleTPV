# Arnés de evaluación del agente de dashboards (#226)

Formaliza el workflow adversarial que validó la calidad compositiva del agente (6 peticiones
reales + juez por composición) en un **arnés repetible**, para no regresionar al tocar el prompt o
el vocabulario (`crates/domain/src/chat/context.rs`, `crates/ai/src/tools.rs`, bloques/piezas del
frontend).

Fuente: [`apps/backoffice/src/lib/agent-eval-harness.ts`](../apps/backoffice/src/lib/agent-eval-harness.ts).

## Dos mitades

### 1. Determinista — `validateComposition` (gate automático, sin LLM)

Comprueba que las tool calls del agente usan **solo** vocabulario real: `widget_id` ∈ bloques ∪
catálogo ∪ `gen:panel`; en `gen:panel`, cada pieza con endpoint ∈ allowlist, pieza ∈ slot correcto,
`labelField`/`valueField` ∈ campos reales del DTO (`ENDPOINT_FIELDS`), formato válido y sin saturar
(≤ `MAX_COMPOSITE_LEAVES`). La verdad de tierra son las mismas allowlists que el runtime usa para
reparar (`normalizePanelSpec`).

Se ejecuta en CI con el resto de Vitest:

```bash
pnpm --filter @simpletpv/backoffice exec vitest run src/lib/agent-eval-harness.test.ts
```

Cualquier composición con vocabulario inventado → violaciones → test rojo. **Umbral: valid = 100 %.**

### 2. Juez LLM — coherencia/jerarquía/anti-saturación (gate manual al cambiar el prompt)

Mitad cualitativa: por cada petición de `EVAL_REQUESTS`, ejecutar el agente con un **modelo barato**,
recoger sus `CanvasOp`, pasar `validateComposition` (debe dar 100 % válido) y puntuar con un juez LLM
según `EVAL_RUBRIC` (coherencia, jerarquía, anti-saturación, fidelidad; 0–10 cada una).

**Umbral del gate** (`EVAL_THRESHOLD`): `valid = 100 %` **y** `score medio ≥ 8`.

Procedimiento manual (requiere API key + API levantada con datos demo):

1. Levantar API + seed demo (ver `#213` para el repro local con BD aislada).
2. Para cada `EVAL_REQUESTS[i].prompt`: `POST /chat/stream`, recolectar los `canvas_op` del SSE.
3. `validateComposition(ops)` → registrar `valid` y violaciones.
4. Pasar la composición + intención al juez LLM con `EVAL_RUBRIC` → puntuaciones.
5. Agregar: `validPct` y `meanScore`. Comparar con `EVAL_THRESHOLD`. Si baja del umbral, **no
   mergear** el cambio de prompt/vocabulario.

## Cuándo correrlo

- **Determinista**: siempre (CI).
- **Juez LLM**: al tocar el prompt del agente, el catálogo de bloques/piezas o la allowlist de
  endpoints. Es un gate **manual** porque consume LLM y una API con datos.

## Mantenimiento

`ENDPOINT_FIELDS` es el espejo TS de los campos por endpoint del prompt
(`WIDGETABLE_ENDPOINTS` en `chat/context.rs`). Al añadir/cambiar un endpoint widgetable, actualizar
ambos lados; el test `el mapa de campos cubre exactamente la allowlist` falla si el SET de endpoints
diverge.
