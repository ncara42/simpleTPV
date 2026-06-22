import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  parseMetricsLog,
  renderComparison,
  renderMarkdown,
  summarize,
} from './agent-metrics-report.js';

// Runner del informe de métricas del agente (#200). Lee una muestra de logs `chat_metrics` y produce
// el informe. Se SALTA si no hay muestra (no corre en CI: requiere logs de sesiones reales).
//   # informe de una muestra:
//   METRICS_LOG=sample.log pnpm --filter @simpletpv/backoffice metrics:report
//   # comparativa antes/después:
//   METRICS_LOG_BEFORE=v1.log METRICS_LOG_AFTER=v2.log [METRICS_OUT=informe.md] pnpm ... metrics:report
const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const single = env.METRICS_LOG;
const before = env.METRICS_LOG_BEFORE;
const after = env.METRICS_LOG_AFTER;
const out = env.METRICS_OUT;
const ready = Boolean(single || (before && after));

describe('informe de métricas del agente (#200)', () => {
  if (!ready) {
    it.skip('requiere METRICS_LOG o METRICS_LOG_BEFORE+METRICS_LOG_AFTER', () => {});
    return;
  }

  it('produce el informe a partir de la muestra de logs', () => {
    let md: string;
    if (before && after) {
      const b = summarize(parseMetricsLog(readFileSync(before, 'utf8')));
      const a = summarize(parseMetricsLog(readFileSync(after, 'utf8')));
      md = `${renderComparison(b, a)}\n\n${renderMarkdown(b, 'Antes (pre-v2)')}\n\n${renderMarkdown(a, 'Después (post-v2)')}`;
      expect(a.turnCount + a.canvasCount).toBeGreaterThan(0);
    } else {
      const s = summarize(parseMetricsLog(readFileSync(single!, 'utf8')));
      md = renderMarkdown(s, 'Muestra');
      expect(s.turnCount + s.canvasCount).toBeGreaterThan(0);
    }
    console.log(`\n${md}\n`);
    if (out) {
      writeFileSync(out, `${md}\n`);
      console.log(`Informe escrito en ${out}`);
    }
  });
});
