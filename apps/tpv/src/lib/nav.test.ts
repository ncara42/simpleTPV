import { describe, expect, it } from 'vitest';

import { siblingAppUrl } from './nav.js';

describe('siblingAppUrl (tpv → backoffice)', () => {
  it('usa el puerto de dev del backoffice en localhost', () => {
    expect(siblingAppUrl({ protocol: 'http:', hostname: 'localhost' }, 'admin', 5174)).toBe(
      'http://localhost:5174',
    );
    expect(siblingAppUrl({ protocol: 'http:', hostname: '127.0.0.1' }, 'admin', 5174)).toBe(
      'http://localhost:5174',
    );
  });

  it('deriva el subdominio del backoffice en producción', () => {
    expect(
      siblingAppUrl({ protocol: 'https:', hostname: 'tpv.noelcaravaca.com' }, 'admin', 5174),
    ).toBe('https://admin.noelcaravaca.com');
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
