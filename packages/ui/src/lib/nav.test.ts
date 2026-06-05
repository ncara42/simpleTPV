import { describe, expect, it } from 'vitest';

import { siblingAppUrl } from './nav.js';

describe('siblingAppUrl', () => {
  it('usa el puerto de dev en localhost (ambas direcciones)', () => {
    expect(siblingAppUrl({ protocol: 'http:', hostname: 'localhost' }, 'admin', 5174)).toBe(
      'http://localhost:5174',
    );
    expect(siblingAppUrl({ protocol: 'http:', hostname: '127.0.0.1' }, 'tpv', 5173)).toBe(
      'http://localhost:5173',
    );
  });

  it('deriva el subdominio hermano en producción', () => {
    // tpv → backoffice
    expect(
      siblingAppUrl({ protocol: 'https:', hostname: 'tpv.noelcaravaca.com' }, 'admin', 5174),
    ).toBe('https://admin.noelcaravaca.com');
    // backoffice → tpv
    expect(
      siblingAppUrl({ protocol: 'https:', hostname: 'admin.noelcaravaca.com' }, 'tpv', 5173),
    ).toBe('https://tpv.noelcaravaca.com');
  });

  it('el override de build gana sobre la derivación', () => {
    expect(
      siblingAppUrl(
        { protocol: 'https:', hostname: 'tpv.noelcaravaca.com' },
        'admin',
        5174,
        'https://otra.example.com',
      ),
    ).toBe('https://otra.example.com');
  });
});
