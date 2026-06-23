import { describe, expect, it } from 'vitest';

import {
  fallbackTransferName,
  normalizeTransferName,
  TRANSFER_NAME_MAX_LENGTH,
  transferDisplayName,
} from './transfer-name.js';

describe('fallbackTransferName', () => {
  it('compone "Origen → Destino" cuando hay ambas tiendas', () => {
    // Arrange
    const origin = 'Centro';
    const dest = 'Norte';

    // Act
    const name = fallbackTransferName(origin, dest);

    // Assert
    expect(name).toBe('Centro → Norte');
  });

  it('recorta espacios de los nombres de tienda', () => {
    expect(fallbackTransferName('  Centro  ', '  Norte ')).toBe('Centro → Norte');
  });

  it('usa solo el origen si falta el destino', () => {
    expect(fallbackTransferName('Centro', undefined)).toBe('Centro');
  });

  it('usa solo el destino si falta el origen', () => {
    expect(fallbackTransferName('', 'Norte')).toBe('Norte');
  });

  it('cae a "Traspaso" cuando no hay ninguna tienda', () => {
    expect(fallbackTransferName(undefined, undefined)).toBe('Traspaso');
  });
});

describe('normalizeTransferName', () => {
  it('aplica trim al valor escrito', () => {
    expect(normalizeTransferName('  Reposición fin de mes  ')).toBe('Reposición fin de mes');
  });

  it('recorta a 80 caracteres', () => {
    // Arrange
    const long = 'a'.repeat(120);

    // Act
    const result = normalizeTransferName(long);

    // Assert
    expect(result).toHaveLength(TRANSFER_NAME_MAX_LENGTH);
  });

  it('devuelve cadena vacía cuando solo hay espacios', () => {
    expect(normalizeTransferName('   ')).toBe('');
  });
});

describe('transferDisplayName', () => {
  it('muestra notes cuando existe', () => {
    expect(transferDisplayName('Reposición', 'Centro', 'Norte')).toBe('Reposición');
  });

  it('cae al fallback "Origen → Destino" cuando notes es null', () => {
    expect(transferDisplayName(null, 'Centro', 'Norte')).toBe('Centro → Norte');
  });

  it('cae al fallback cuando notes es solo espacios', () => {
    expect(transferDisplayName('   ', 'Centro', 'Norte')).toBe('Centro → Norte');
  });
});
