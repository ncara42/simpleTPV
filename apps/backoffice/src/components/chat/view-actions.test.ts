import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeViewAction, filterView, highlightOnView } from './view-actions.js';

// jsdom no implementa scrollIntoView; el executor lo invoca al resaltar/filtrar.
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  document.body.innerHTML = '';
});

function mountView(html: string): void {
  document.body.innerHTML = `<main class="bo-main">${html}</main>`;
}

const HL = 'view-action-highlight';

describe('highlightOnView', () => {
  it('localiza por texto exacto y resalta su bloque visible', () => {
    mountView(`
      <table><thead><tr>
        <th>Nombre</th><th>SKU</th><th>Precio</th>
      </tr></thead></table>
    `);
    expect(highlightOnView('SKU')).toBe(true);
    const highlighted = document.querySelector(`.${HL}`);
    expect(highlighted).not.toBeNull();
    // El <th> no es un bloque; se resalta su fila contenedora.
    expect(highlighted?.tagName).toBe('TR');
    expect(highlighted?.textContent).toContain('SKU');
  });

  it('ignora tildes y mayúsculas al comparar', () => {
    mountView('<h2>Rotación de productos</h2>');
    expect(highlightOnView('rotacion de productos')).toBe(true);
    expect(document.querySelector(`.${HL}`)?.textContent).toContain('Rotación');
  });

  it('prefiere la coincidencia más específica (texto más corto)', () => {
    mountView(`
      <button data-testid="corto">Ventas</button>
      <button data-testid="largo">Ventas por familia y vendedor</button>
    `);
    expect(highlightOnView('Ventas')).toBe(true);
    // Coincidencia exacta gana a la que solo lo contiene.
    expect(document.querySelector(`.${HL}`)?.getAttribute('data-testid')).toBe('corto');
  });

  it('hace scroll hasta el objetivo', () => {
    mountView('<h3>Caducidades</h3>');
    highlightOnView('Caducidades');
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('devuelve false y no resalta nada si no encuentra el objetivo', () => {
    mountView('<h2>Stock</h2>');
    expect(highlightOnView('no existe en pantalla')).toBe(false);
    expect(document.querySelector(`.${HL}`)).toBeNull();
  });

  it('no busca fuera de main.bo-main (no se auto-resalta el chat)', () => {
    document.body.innerHTML = `
      <main class="bo-main"><h1>Catálogo</h1></main>
      <aside class="chat-dock"><button>Exportar</button></aside>
    `;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    expect(highlightOnView('Exportar')).toBe(false);
  });
});

describe('filterView', () => {
  it('escribe en el buscador y dispara el evento input (React lo intercepta)', () => {
    mountView('<span class="search-field"><input placeholder="Buscar…" /></span>');
    const input = document.querySelector('input') as HTMLInputElement;
    const onInput = vi.fn();
    input.addEventListener('input', onInput);

    expect(filterView('gorilla')).toBe(true);
    expect(input.value).toBe('gorilla');
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onInput.mock.calls[0]?.[0]).toBeInstanceOf(Event);
  });

  it('cadena vacía limpia el filtro', () => {
    mountView('<span class="search-field"><input value="algo" /></span>');
    const input = document.querySelector('input') as HTMLInputElement;
    expect(filterView('')).toBe(true);
    expect(input.value).toBe('');
  });

  it('devuelve false si la vista no tiene buscador', () => {
    mountView('<h1>Ajustes</h1>');
    expect(filterView('lo que sea')).toBe(false);
  });
});

describe('executeViewAction', () => {
  it('enruta highlight_on_view con su target', () => {
    mountView('<h2>Proveedores</h2>');
    executeViewAction('highlight_on_view', { target: 'Proveedores' });
    expect(document.querySelector(`.${HL}`)?.textContent).toContain('Proveedores');
  });

  it('enruta filter_view con su query', () => {
    mountView('<span class="search-field"><input /></span>');
    executeViewAction('filter_view', { query: 'acme' });
    expect((document.querySelector('input') as HTMLInputElement).value).toBe('acme');
  });

  it('tolera args ausentes o mal formados sin lanzar', () => {
    mountView('<span class="search-field"><input /></span>');
    expect(() => executeViewAction('filter_view', undefined)).not.toThrow();
    expect(() => executeViewAction('highlight_on_view', { target: 123 })).not.toThrow();
  });
});
