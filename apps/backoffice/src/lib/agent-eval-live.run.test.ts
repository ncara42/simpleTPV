import { describe, expect, it } from 'vitest';

import { EVAL_THRESHOLD } from './agent-eval-harness.js';
import { evalConfigFromEnv, runEvalSuite } from './agent-eval-live.js';

// Gate MANUAL del arnés vivo (#226): ejecuta el agente real + juez LLM sobre EVAL_REQUESTS y exige
// el umbral (valid=100 %, score medio ≥8). Se SALTA si falta configuración (no corre en CI: requiere
// API levantada con datos demo + gateway LLM). Lanzar con:
//   pnpm --filter @simpletpv/backoffice eval:agent
// y las variables EVAL_API_URL, EVAL_TOKEN, EVAL_AGENT_MODEL, EVAL_JUDGE_MODEL, OPENAI_BASE_URL/KEY.
const cfg = evalConfigFromEnv();

describe('arnés vivo del agente compositor (#226)', () => {
  if (!('config' in cfg)) {
    it.skip(`requiere configuración EVAL_* (faltan: ${cfg.missing.join(', ')})`, () => {});
    return;
  }

  it('todas las composiciones válidas y score medio sobre el umbral', async () => {
    const summary = await runEvalSuite(cfg.config, undefined, (m) => console.log(m));
    console.log(
      `\nRESUMEN: valid=${summary.validPct}% score=${summary.meanScore.toFixed(2)} hits=${summary.hitRatePct}% pass=${summary.pass}`,
    );
    for (const r of summary.results) {
      if (!r.valid) console.log(`  ✗ ${r.id}: ${r.error ?? JSON.stringify(r.violations)}`);
    }
    expect(summary.validPct).toBeGreaterThanOrEqual(EVAL_THRESHOLD.minValidPct);
    expect(summary.meanScore).toBeGreaterThanOrEqual(EVAL_THRESHOLD.minMeanScore);
  }, 600_000);
});
