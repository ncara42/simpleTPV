// Beep corto de confirmación de escaneo vía WebAudio. Totalmente defensivo: si el
// navegador no soporta AudioContext o el contexto está bloqueado, no hace nada
// (el banner visual es la confirmación principal; el sonido es opcional, #2.1).

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

export function beep(kind: 'ok' | 'error' = 'ok'): void {
  try {
    const audio = getCtx();
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    // Tono agudo y corto para "ok"; más grave y largo para "error".
    osc.type = 'square';
    osc.frequency.value = kind === 'ok' ? 880 : 220;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(audio.destination);
    const now = audio.currentTime;
    osc.start(now);
    osc.stop(now + (kind === 'ok' ? 0.08 : 0.16));
  } catch {
    // Silencioso: el feedback de sonido es opcional.
  }
}
