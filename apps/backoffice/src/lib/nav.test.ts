import { describe, expect, it } from 'vitest';

import { siblingAppUrl } from './nav.js';

describe('siblingAppUrl (backoffice → tpv)', () => {
  it('usa el puerto de dev del TPV en localhost', () => {
    expect(siblingAppUrl({ protocol: 'http:', hostname: 'localhost' }, 'tpv', 5173)).toBe(
      'http://localhost:5173',
    );
    expect(siblingAppUrl({ protocol: 'http:', hostname: '127.0.0.1' }, 'tpv', 5173)).toBe(
      'http://localhost:5173',
    );
  });

  it('deriva el subdominio del TPV en producción', () => {
    expect(
      siblingAppUrl({ protocol: 'https:', hostname: 'admin.noelcaravaca.com' }, 'tpv', 5173),
    ).toBe('https://tpv.noelcaravaca.com');
  });

  it('el override de build gana sobre la derivación', () => {
    expect(
      siblingAppUrl(
        { protocol: 'https:', hostname: 'admin.noelcaravaca.com' },
        'tpv',
        5173,
        'https://otra.example.com',
      ),
    ).toBe('https://otra.example.com');
  });
});
