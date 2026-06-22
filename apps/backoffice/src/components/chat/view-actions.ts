import type { ViewActionName } from '../../lib/chat.js';

// Ejecutor de las acciones de pantalla del agente (fuera del dashboard). Trabaja sobre el DOM de
// la vista actual (`main.bo-main`), no sobre el lienzo: hace scroll + resalta un elemento por su
// texto, o escribe en el buscador de la vista para filtrar. Es best-effort: si no encuentra el
// objetivo o la vista no tiene buscador, no hace nada (no rompe el turno del chat).

const HIGHLIGHT_CLASS = 'view-action-highlight';
const HIGHLIGHT_MS = 2600;
// El buscador compartido de las páginas de listado (`<span class="search-field"><input/></span>`).
const SEARCH_SELECTOR = '.search-field input, input[type="search"], input[placeholder*="Busc"]';
// Elementos cuyo texto visible puede referenciar el usuario («¿dónde está X?»).
const TARGET_SELECTOR =
  'h1,h2,h3,h4,h5,th,td,label,button,a,summary,legend,dt,[role="heading"],[data-testid]';
// Al resaltar, preferimos un bloque visible (tarjeta/fila/sección) sobre un span suelto.
const BLOCK_SELECTOR = '[data-testid],tr,li,.kpi-card,.card,section,.panel,.dataviz-card';

/** Contenedor de la vista activa (el dock del asistente queda fuera, así no se auto-resalta). */
function viewRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('main.bo-main');
}

/** Normaliza para comparar: minúsculas, sin tildes, espacios colapsados. */
function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas diacríticas combinantes (tildes, diéresis…)
    .replace(/\s+/g, ' ')
    .trim();
}

function visibleText(el: Element): string {
  return norm(el.textContent ?? '');
}

function isVisible(el: HTMLElement): boolean {
  // En navegador moderno, checkVisibility cubre display:none, visibility:hidden y content-visibility.
  if (typeof el.checkVisibility === 'function') return el.checkVisibility();
  // Fallback (jsdom / navegadores antiguos): descarta solo lo oculto explícitamente por estilo
  // inline o atributo `hidden` en el elemento o sus ancestros.
  for (let cur: HTMLElement | null = el; cur; cur = cur.parentElement) {
    if (cur.hidden) return false;
    const s = cur.style;
    if (s && (s.display === 'none' || s.visibility === 'hidden')) return false;
  }
  return true;
}

/** Puntúa cuánto encaja el texto de un elemento con el objetivo (0 = no encaja). */
function matchScore(text: string, target: string): number {
  if (!text) return 0;
  if (text === target) return 4;
  if (text.startsWith(target)) return 3;
  if (new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) return 2;
  if (text.includes(target)) return 1;
  return 0;
}

/** Mejor elemento de la vista cuyo texto visible coincide con `target`. */
function findByText(root: HTMLElement, targetRaw: string): HTMLElement | null {
  const target = norm(targetRaw);
  if (!target) return null;
  const matches: { el: HTMLElement; score: number; len: number }[] = [];
  root.querySelectorAll<HTMLElement>(TARGET_SELECTOR).forEach((el) => {
    if (!isVisible(el)) return;
    const text = visibleText(el);
    // Saltamos contenedores enormes: queremos el rótulo más específico, no media pantalla.
    if (!text || text.length > 120) return;
    const score = matchScore(text, target);
    if (score > 0) matches.push({ el, score, len: text.length });
  });
  if (matches.length === 0) return null;
  // Mayor puntuación primero; a igualdad, el texto más corto (más específico).
  matches.sort((a, b) => b.score - a.score || a.len - b.len);
  return matches[0]?.el ?? null;
}

/** Hace scroll hasta el elemento que mejor coincide con `target` y lo resalta. */
export function highlightOnView(target: string): boolean {
  const root = viewRoot();
  if (!root) return false;
  const match = findByText(root, target);
  if (!match) return false;
  const block = (match.closest<HTMLElement>(BLOCK_SELECTOR) ?? match) as HTMLElement;
  block.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Reinicia la animación si ya estaba resaltado (resaltados consecutivos).
  block.classList.remove(HIGHLIGHT_CLASS);
  void block.offsetWidth;
  block.classList.add(HIGHLIGHT_CLASS);
  window.setTimeout(() => block.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
  return true;
}

/**
 * Asigna el valor a un input controlado por React: el setter nativo + un evento `input` que React
 * intercepta para actualizar su estado (patrón estándar, el mismo que usa Testing Library).
 */
function setReactInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Escribe `query` en el buscador de la vista actual para filtrar el listado. */
export function filterView(query: string): boolean {
  const root = viewRoot();
  if (!root) return false;
  const input = root.querySelector<HTMLInputElement>(SEARCH_SELECTOR);
  if (!input) return false;
  input.focus();
  setReactInputValue(input, query);
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return true;
}

/** Despacha una acción de pantalla del agente. Tolera args ausentes o mal formados. */
export function executeViewAction(action: ViewActionName, args: unknown): void {
  const params = (args ?? {}) as Record<string, unknown>;
  if (action === 'highlight_on_view') {
    const target = typeof params.target === 'string' ? params.target : '';
    if (target) highlightOnView(target);
  } else if (action === 'filter_view') {
    const query = typeof params.query === 'string' ? params.query : '';
    filterView(query);
  }
}
