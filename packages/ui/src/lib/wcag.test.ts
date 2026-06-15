import { describe, expect, it } from 'vitest';

import { contrastRatio, evaluateBrandColor, wcagLevel } from './wcag.js';

describe('contrastRatio', () => {
  it('negro sobre blanco da el ratio máximo (~21:1)', () => {
    // Arrange / Act
    const ratio = contrastRatio('#000000', '#ffffff');

    // Assert
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('un color sobre sí mismo da 1:1', () => {
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#0e7c6b', '#0e7c6b')).toBeCloseTo(1, 5);
  });

  it('es simétrico (no depende del orden fg/bg)', () => {
    expect(contrastRatio('#0e7c6b', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#0e7c6b'), 6);
  });
});

describe('wcagLevel', () => {
  it('clasifica AAA a partir de 7:1', () => {
    expect(wcagLevel(7)).toBe('AAA');
    expect(wcagLevel(10)).toBe('AAA');
  });

  it('clasifica AA entre 4.5 y 7', () => {
    expect(wcagLevel(4.5)).toBe('AA');
    expect(wcagLevel(4.6)).toBe('AA');
    expect(wcagLevel(6.9)).toBe('AA');
  });

  it('clasifica AA-large entre 3 y 4.5', () => {
    expect(wcagLevel(3)).toBe('AA-large');
    expect(wcagLevel(3.2)).toBe('AA-large');
    expect(wcagLevel(4.49)).toBe('AA-large');
  });

  it('clasifica fail por debajo de 3', () => {
    expect(wcagLevel(2)).toBe('fail');
    expect(wcagLevel(1)).toBe('fail');
  });
});

describe('evaluateBrandColor', () => {
  it('el teal por defecto (#0e7c6b) es válido como color de marca', () => {
    // Act
    const report = evaluateBrandColor('#0e7c6b');

    // Assert
    expect(report.ok).toBe(true);
    expect(report.buttonText.level).not.toBe('fail');
    expect(report.onSurface.level).not.toBe('fail');
  });

  it('elige el mejor texto del botón (blanco sobre marca oscura)', () => {
    const report = evaluateBrandColor('#0a356b'); // azul oscuro
    expect(report.buttonText.fg).toBe('#ffffff');
    expect(report.buttonText.level).not.toBe('fail');
  });

  it('elige texto oscuro del botón sobre marca clara', () => {
    const report = evaluateBrandColor('#ffd83d'); // amarillo claro
    expect(report.buttonText.fg).toBe('#18181a');
  });

  it('un amarillo problemático no pasa como acento de texto sobre blanco', () => {
    // Arrange / Act
    const report = evaluateBrandColor('#ffe600'); // amarillo casi puro

    // Assert: legible como botón (texto oscuro) pero ilegible como texto sobre blanco
    expect(report.onSurface.level).toBe('fail');
    expect(report.ok).toBe(false);
  });

  it('usa las superficies reales pasadas por parámetro', () => {
    // Sobre un fondo oscuro el mismo amarillo sí contrasta como acento.
    const report = evaluateBrandColor('#ffe600', { surface: '#101010', bg: '#101010' });
    expect(report.onSurface.level).not.toBe('fail');
    expect(report.onBackground.level).not.toBe('fail');
  });
});
