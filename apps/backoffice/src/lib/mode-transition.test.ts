import { describe, expect, it } from 'vitest';

import { buildSkeleton, captureBoardItems, skeletonStyle } from './mode-transition.js';

const stubRect = (el: HTMLElement, r: Partial<DOMRect>): void => {
  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...r,
    }) as DOMRect;
};

describe('captureBoardItems', () => {
  it('returns an empty map for a null host', () => {
    expect(captureBoardItems(null).size).toBe(0);
  });

  it('captures only [data-board-item] nodes with a non-zero rect, keyed by id', () => {
    const host = document.createElement('div');
    const a = document.createElement('div');
    a.dataset.boardItem = 'w1';
    stubRect(a, { left: 10, top: 20, width: 100, height: 50 });
    const collapsed = document.createElement('div');
    collapsed.dataset.boardItem = 'w2';
    stubRect(collapsed, { left: 0, top: 0, width: 0, height: 0 }); // 0×0 → ignorado
    const untracked = document.createElement('div');
    stubRect(untracked, { left: 5, top: 5, width: 30, height: 30 }); // sin data-board-item
    host.append(a, collapsed, untracked);

    const map = captureBoardItems(host);
    expect([...map.keys()]).toEqual(['w1']);
    expect(map.get('w1')?.rect).toEqual({ x: 10, y: 20, w: 100, h: 50 });
    expect(map.get('w1')?.node).toBe(a);
  });
});

describe('buildSkeleton', () => {
  it('crea una caja de carga vacía posicionada en el rect (fixed, origen sup-izq, no interactiva)', () => {
    const skel = buildSkeleton({ x: 5, y: 7, w: 200, h: 120 });

    expect(skel.tagName).toBe('DIV');
    expect(skel.classList.contains('dash-mode-skeleton')).toBe(true);
    expect(skel.getAttribute('aria-hidden')).toBe('true');
    // Caja lisa: sin contenido real (no clona nada).
    expect(skel.childNodes.length).toBe(0);
    // Posicionado en coordenadas de pantalla, no interactivo.
    expect(skel.style.position).toBe('fixed');
    expect(skel.style.transformOrigin).toBe('top left');
    expect(skel.style.transform).toBe('translate(5px, 7px)');
    expect(skel.style.width).toBe('200px');
    expect(skel.style.height).toBe('120px');
    expect(skel.style.pointerEvents).toBe('none');
  });

  it('copia el radio y el fondo REALES de la superficie de origen (el radio no cambia en el morph)', () => {
    const source = document.createElement('div');
    source.style.borderRadius = '18px';
    source.style.backgroundColor = 'rgb(255, 247, 214)'; // nota amarilla

    const skel = buildSkeleton({ x: 0, y: 0, w: 100, h: 80 }, source);

    expect(skel.style.borderRadius).toBe('18px');
    expect(skel.style.background).toBe('rgb(255, 247, 214)');
  });

  it('cuando el wrapper es transparente (radio 0), toma el radio de la superficie interior', () => {
    const wrapper = document.createElement('div'); // .dash-free-item: sin radio/fondo
    const inner = document.createElement('div');
    inner.className = 'dash-card';
    inner.style.borderRadius = '18px';
    wrapper.appendChild(inner);

    const skel = buildSkeleton({ x: 0, y: 0, w: 100, h: 80 }, wrapper);

    expect(skel.style.borderRadius).toBe('18px');
  });

  it('no copia un fondo transparente como color sólido', () => {
    const source = document.createElement('div');
    source.style.borderRadius = '18px';
    // sin background → transparente; no debe copiarse
    const skel = buildSkeleton({ x: 0, y: 0, w: 100, h: 80 }, source);
    expect(skel.style.background).toBe('');
  });

  it('una anotación a mano (shape) vuela transparente y sin borde (no finge una card)', () => {
    const shape = document.createElement('div');
    shape.className = 'dash-free-item dash-free-item--shape';
    const skel = buildSkeleton({ x: 0, y: 0, w: 50, h: 50 }, shape);
    expect(skel.style.background).toBe('transparent');
    expect(skel.style.borderStyle).toBe('none');
  });
});

describe('skeletonStyle', () => {
  it('escala el radio al zoom del lienzo: radio en pantalla = radioLayout × rect.w/offsetWidth', () => {
    const node = document.createElement('div');
    node.style.borderRadius = '18px';
    Object.defineProperty(node, 'offsetWidth', { value: 200, configurable: true });
    // rect.w = 100 sobre un ancho de layout de 200 → escala 0.5 → 9px en pantalla.
    expect(skeletonStyle(node, { x: 0, y: 0, w: 100, h: 80 }).radius).toBe('9px');
  });

  it('un widget del agente sin radio propio cae al token unificado (no vuela cuadrado)', () => {
    const node = document.createElement('div');
    node.className = 'dash-free-item dash-free-item--widget';
    node.style.setProperty('--ui-radius-lg', '18px');
    const st = skeletonStyle(node, { x: 0, y: 0, w: 100, h: 80 }); // offsetWidth 0 → escala 1
    expect(st.surface).toBe(true);
    expect(st.radius).toBe('18px');
  });

  it('shape/draw/text → surface:false', () => {
    const shape = document.createElement('div');
    shape.className = 'dash-free-item--draw';
    expect(skeletonStyle(shape, { x: 0, y: 0, w: 40, h: 40 }).surface).toBe(false);
  });
});
