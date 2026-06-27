import { type RefObject, useEffect } from 'react';

// Parámetros de la malla (idénticos al diseño Login.dc): tamaño de celda,
// amplitudes de onda y radio/intensidad del empuje del puntero.
const CELL = 68;
const AMP = 18;
const AMP2 = 11;
const PUSH_RADIUS = 190;
const PUSH_FORCE = 40;
const MAX_DPR = 2;

// Paleta de la variante «light» (panel casi blanco): líneas y nodos en gris
// azulado muy translúcido, una rejilla técnica delicada sobre el degradado claro.
const LINE_COLOR = 'rgba(30, 41, 66, 0.11)';
const DOT_COLOR = 'rgba(30, 41, 66, 0.16)';

// Centinela: posición de puntero «aún sin estrenar» (fuera de cualquier lienzo).
const NO_POINTER = -99999;

type Point = readonly [number, number];

/**
 * Anima una malla de puntos en el `<canvas>` del panel de marca: ondula sola y
 * se aparta del puntero. Respeta `prefers-reduced-motion` (pinta un único
 * fotograma estático, sin bucle ni escucha del puntero) y limpia
 * rAF / ResizeObserver / listeners al desmontar. No hace nada si el canvas o su
 * contexto 2D no existen (SSR / jsdom), de modo que el panel degrada a un fondo
 * liso sin romper.
 */
export function useBrandMesh(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Estado imperativo del bucle de dibujo (no es estado de React: es scratch
    // de animación). `cx/cy` = posición suavizada del puntero; `inf` = influencia
    // [0..1]; `hover` = 1 mientras el puntero está sobre el panel.
    const st = {
      w: 0,
      h: 0,
      dpr: 1,
      mx: NO_POINTER,
      my: NO_POINTER,
      cx: NO_POINTER,
      cy: NO_POINTER,
      inf: 0,
      hover: 0,
    };

    const resize = (): boolean => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w === st.w && h === st.h && canvas.width) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      st.w = w;
      st.h = h;
      st.dpr = dpr;
      return true;
    };

    const t0 = performance.now();

    const render = (now: number): void => {
      const { w, h, dpr } = st;
      if (!w || !h) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const t = reduced ? 0 : (now - t0) * 0.001;
      const cols = Math.ceil(w / CELL) + 4;
      const rows = Math.ceil(h / CELL) + 4;
      const driftX = Math.sin(t * 0.06) * 20;
      const driftY = Math.cos(t * 0.05) * 20;

      // Suavizado de la influencia del puntero y de su posición.
      st.inf += ((st.hover ? 1 : 0) - st.inf) * 0.08;
      if (st.hover && st.cx < -9000) {
        st.cx = st.mx;
        st.cy = st.my;
      }
      if (st.cx > -9000) {
        st.cx += (st.mx - st.cx) * 0.2;
        st.cy += (st.my - st.cy) * 0.2;
      }
      const pushing = st.inf > 0.001 && st.cx > -9000;

      const grid: Point[][] = [];
      for (let j = 0; j < rows; j++) {
        const row: Point[] = [];
        for (let i = 0; i < cols; i++) {
          const bx = (i - 2) * CELL;
          const by = (j - 2) * CELL;
          const dx =
            Math.sin(by * 0.012 + t * 0.42) * AMP +
            Math.cos((bx + by) * 0.008 - t * 0.32) * AMP2 +
            driftX;
          const dy =
            Math.cos(bx * 0.012 + t * 0.38) * AMP +
            Math.sin((bx - by) * 0.009 + t * 0.5) * AMP2 +
            driftY;
          let px = bx + dx;
          let py = by + dy;
          if (pushing) {
            const ox = px - st.cx;
            const oy = py - st.cy;
            const d2 = ox * ox + oy * oy;
            if (d2 < PUSH_RADIUS * PUSH_RADIUS) {
              const d = Math.sqrt(d2) || 0.001;
              const f = 1 - d / PUSH_RADIUS;
              const push = f * f * PUSH_FORCE * st.inf;
              const nx = ox / d;
              const ny = oy / d;
              px += nx * push - ny * push * 0.35;
              py += ny * push + nx * push * 0.35;
            }
          }
          row.push([px, py]);
        }
        grid.push(row);
      }

      // Aristas (vecino derecho + inferior) en un único trazo. Leer fuera de
      // rango devuelve undefined → hace de guarda de borde sin índices extra.
      ctx.lineWidth = 1;
      ctx.strokeStyle = LINE_COLOR;
      ctx.beginPath();
      for (let j = 0; j < rows; j++) {
        const row = grid[j];
        const nextRow = grid[j + 1];
        if (!row) continue;
        for (let i = 0; i < cols; i++) {
          const p = row[i];
          if (!p) continue;
          const right = row[i + 1];
          if (right) {
            ctx.moveTo(p[0], p[1]);
            ctx.lineTo(right[0], right[1]);
          }
          const down = nextRow?.[i];
          if (down) {
            ctx.moveTo(p[0], p[1]);
            ctx.lineTo(down[0], down[1]);
          }
        }
      }
      ctx.stroke();

      // Nodos.
      ctx.fillStyle = DOT_COLOR;
      ctx.beginPath();
      for (const row of grid) {
        for (const p of row) {
          ctx.moveTo(p[0] + 1.4, p[1]);
          ctx.arc(p[0], p[1], 1.4, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    };

    resize();

    // Movimiento reducido: un único fotograma estático. Solo redibujamos si el
    // contenedor cambia de tamaño (sin bucle ni seguimiento del puntero).
    if (reduced) {
      render(t0);
      let staticRo: ResizeObserver | undefined;
      try {
        staticRo = new ResizeObserver(() => {
          if (resize()) render(t0);
        });
        staticRo.observe(host);
      } catch {
        // Sin ResizeObserver: el fotograma inicial basta.
      }
      return () => staticRo?.disconnect();
    }

    // Animación completa: bucle rAF + seguimiento del puntero.
    let rafId = 0;
    let resizeRaf = 0;
    let ro: ResizeObserver | undefined;
    try {
      ro = new ResizeObserver(() => {
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = 0;
          resize();
        });
      });
      ro.observe(host);
    } catch {
      // Sin ResizeObserver: la malla no se reajusta al redimensionar la ventana.
    }

    const onMove = (e: PointerEvent): void => {
      const r = canvas.getBoundingClientRect();
      st.mx = e.clientX - r.left;
      st.my = e.clientY - r.top;
      st.hover = 1;
    };
    const onLeave = (): void => {
      st.hover = 0;
    };
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerdown', onMove);
    host.addEventListener('pointerleave', onLeave);

    const loop = (now: number): void => {
      rafId = requestAnimationFrame(loop);
      render(now);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      ro?.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerdown', onMove);
      host.removeEventListener('pointerleave', onLeave);
    };
  }, [canvasRef]);
}
