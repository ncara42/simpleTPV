import { type RefObject, useEffect } from 'react';

// Carril horizontal compartido por el heatmap y la distribución horaria: rueda/trackpad + arrastre con
// puntero, barra de scroll propia (thumb calculado en JS) y REBOTE elástico (rubber-band) en los
// extremos. El rebote usa un muelle por requestAnimationFrame que decae de forma continua: así el
// scroll por inercia del trackpad NO deja la tira «pegada» desplazada (ese era el bug), sino que
// muestra un desbordamiento vivo que vuelve solo. Sólo se traslada `stripRef` (transform); el scroll
// real vive en `scrollRef`. `resetKey` re-engancha los listeners cuando el carril aparece o cambian
// sus datos (p. ej. al pasar de «sin datos» a tener datos).

const RESIST = 0.45; // resistencia del desbordamiento (menor = más duro)
const MAX_BAND = 70; // tope del rebote (px)
const DECAY = 0.82; // factor de vuelta del muelle por frame (≈ 0.4 s hasta reposo)

export function useBounceScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  stripRef: RefObject<HTMLDivElement | null>,
  trackRef: RefObject<HTMLDivElement | null>,
  thumbRef: RefObject<HTMLDivElement | null>,
  resetKey: unknown,
): void {
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // ── Barra de scroll personalizada (ancho = proporción visible, posición = avance). ──
    const updateThumb = (): void => {
      const th = thumbRef.current;
      const tr = trackRef.current;
      if (!th || !tr) return;
      const { scrollWidth, clientWidth, scrollLeft } = el;
      const max = scrollWidth - clientWidth;
      const scrollable = max > 1;
      tr.style.opacity = '1';
      if (!scrollable) {
        th.style.width = '100%';
        th.style.left = '0%';
        return;
      }
      const wpct = (clientWidth / scrollWidth) * 100;
      th.style.width = `${wpct}%`;
      th.style.left = `${(scrollLeft / max) * (100 - wpct)}%`;
    };
    updateThumb();
    el.addEventListener('scroll', updateThumb, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateThumb) : null;
    ro?.observe(el);

    // ── Rebote elástico (muelle por rAF) ──
    let band = 0; // desplazamiento actual de la tira (px)
    let raf = 0;
    const drag = { active: false, startX: 0, scrollLeft: 0 };
    const clampB = (v: number): number => Math.max(-MAX_BAND, Math.min(MAX_BAND, v));
    const paint = (): void => {
      const strip = stripRef.current;
      if (strip) strip.style.transform = band ? `translate3d(${band.toFixed(2)}px,0,0)` : '';
    };
    const setBand = (v: number): void => {
      band = clampB(v);
      paint();
    };
    // Mientras se arrastra, el band lo fija el puntero; si no, decae hacia 0 (vuelta del muelle).
    const tick = (): void => {
      raf = 0;
      if (drag.active) return;
      band *= DECAY;
      if (Math.abs(band) < 0.4) band = 0;
      paint();
      if (band !== 0) raf = requestAnimationFrame(tick);
    };
    const ensureTick = (): void => {
      if (!raf && !drag.active) raf = requestAnimationFrame(tick);
    };
    const maxScroll = (): number => el.scrollWidth - el.clientWidth;

    // Rueda/trackpad → scroll horizontal; en los extremos, impulso elástico que el muelle devuelve.
    const onWheel = (e: WheelEvent): void => {
      e.stopPropagation();
      const mult = e.deltaMode === 1 ? 16 : 1;
      const delta = (Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * mult;
      if (delta === 0) return;
      e.preventDefault();
      const max = maxScroll();
      const over = (el.scrollLeft <= 0 && delta < 0) || (el.scrollLeft >= max && delta > 0);
      if (over) {
        setBand(band - delta * RESIST * 0.5);
        ensureTick();
      } else {
        el.scrollLeft += delta;
      }
    };

    // Arrastre con puntero. stopPropagation evita que arranque el pan del lienzo libre; al capturar el
    // puntero seguimos recibiendo move/up aunque el cursor salga del carril.
    const onPointerDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      e.stopPropagation();
      drag.active = true;
      drag.startX = e.clientX;
      drag.scrollLeft = el.scrollLeft;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const onPointerMove = (e: PointerEvent): void => {
      if (!drag.active) return;
      e.preventDefault();
      const desired = drag.scrollLeft - (e.clientX - drag.startX);
      const max = maxScroll();
      if (desired < 0) {
        el.scrollLeft = 0;
        setBand(-desired * RESIST);
      } else if (desired > max) {
        el.scrollLeft = max;
        setBand(-(desired - max) * RESIST);
      } else {
        el.scrollLeft = desired;
        if (band) setBand(0);
      }
    };
    const onPointerUp = (e: PointerEvent): void => {
      if (!drag.active) return;
      drag.active = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.style.cursor = 'grab';
      ensureTick();
    };

    el.style.cursor = 'grab';
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    return () => {
      el.removeEventListener('scroll', updateThumb);
      ro?.disconnect();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      if (raf) cancelAnimationFrame(raf);
      const strip = stripRef.current;
      if (strip) strip.style.transform = '';
    };
  }, [resetKey, scrollRef, stripRef, trackRef, thumbRef]);
}
