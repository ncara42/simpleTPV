import { useCallback, useEffect, useRef, useState } from 'react';

// Reconocimiento de voz nativo (Web Speech API). Sin dependencias: usa
// `SpeechRecognition` / `webkitSpeechRecognition` del navegador (Chrome/Edge; Safari parcial).
// Tipos mínimos porque la API NO está en lib.dom estándar para el prefijo webkit.

interface SpeechAlternative {
  readonly transcript: string;
}
interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  readonly [index: number]: SpeechResult;
}
interface SpeechEvent {
  readonly resultIndex: number;
  readonly results: SpeechResultList;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}
type RecognitionCtor = new () => RecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechRecognitionOptions {
  lang?: string;
  /** Frase final reconocida: se añade al input (como si la escribieras). */
  onFinal: (text: string) => void;
  /** Texto provisional en vivo mientras hablas (preview junto al orbe). */
  onInterim?: (text: string) => void;
}

export interface SpeechRecognitionControls {
  /** El navegador soporta la Web Speech API. */
  supported: boolean;
  listening: boolean;
  /** Último código de error del reconocedor (p. ej. `not-allowed`, `network`), o null. */
  error: string | null;
  toggle: () => void;
  stop: () => void;
}

export function useSpeechRecognition({
  lang = 'es-ES',
  onFinal,
  onInterim,
}: UseSpeechRecognitionOptions): SpeechRecognitionControls {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const supportedRef = useRef<boolean>(getRecognitionCtor() !== null);
  // Detecta el fallo SILENCIOSO (típico de Safari): la API existe y `start()` no lanza, pero nunca
  // llega ningún resultado. Si en unos segundos no hay nada, lo surfaceamos como error.
  const noResultTimerRef = useRef<number | null>(null);
  const gotResultRef = useRef(false);
  // Refs para leer callbacks frescos sin recrear el reconocedor.
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;
  const interimRef = useRef(onInterim);
  interimRef.current = onInterim;
  // ¿El usuario quiere seguir escuchando? El reconocedor se detiene solo en los silencios;
  // si seguimos en modo escucha lo reanudamos en `onend` (escucha continua robusta).
  const wantRef = useRef(false);

  const clearNoResultTimer = (): void => {
    if (noResultTimerRef.current != null) {
      clearTimeout(noResultTimerRef.current);
      noResultTimerRef.current = null;
    }
  };

  const stop = useCallback(() => {
    wantRef.current = false;
    clearNoResultTimer();
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    let rec = recognitionRef.current;
    if (!rec) {
      rec = new Ctor();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: SpeechEvent) => {
        gotResultRef.current = true;
        clearNoResultTimer();
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const result = e.results[i];
          if (!result) continue;
          const text = result[0]?.transcript ?? '';
          if (result.isFinal) finalRef.current(text.trim());
          else interim += text;
        }
        interimRef.current?.(interim.trim());
      };
      rec.onend = () => {
        interimRef.current?.('');
        if (wantRef.current) {
          try {
            rec?.start();
          } catch {
            wantRef.current = false;
            setListening(false);
          }
        } else {
          setListening(false);
        }
      };
      rec.onerror = (e: unknown) => {
        const code =
          e && typeof e === 'object' && 'error' in e
            ? String((e as { error?: unknown }).error)
            : 'unknown';
        // `no-speech`/`aborted` son benignos (silencio o parada manual): no los mostramos.
        if (code !== 'no-speech' && code !== 'aborted') {
          setError(code);
          wantRef.current = false; // error real: no reintentar en bucle.
        }
      };
      recognitionRef.current = rec;
    }
    setError(null);
    gotResultRef.current = false;
    wantRef.current = true;
    try {
      rec.start();
      setListening(true);
      clearNoResultTimer();
      noResultTimerRef.current = window.setTimeout(() => {
        if (!gotResultRef.current) {
          setError('no-result');
          wantRef.current = false;
          recognitionRef.current?.stop();
          setListening(false);
        }
      }, 7000);
    } catch {
      // Ya estaba iniciado: ignorar.
    }
  }, [lang]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Limpieza al desmontar.
  useEffect(
    () => () => {
      wantRef.current = false;
      clearNoResultTimer();
      recognitionRef.current?.abort();
    },
    [],
  );

  return { supported: supportedRef.current, listening, error, toggle, stop };
}
