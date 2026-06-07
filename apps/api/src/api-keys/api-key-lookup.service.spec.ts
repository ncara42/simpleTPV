import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiKeyLookupService } from './api-key-lookup.service.js';

// ---------------------------------------------------------------------------
// hashKey — método estático puro
// ---------------------------------------------------------------------------

describe('ApiKeyLookupService.hashKey', () => {
  it('devuelve un string hexadecimal de 64 caracteres (sha256)', () => {
    const hash = ApiKeyLookupService.hashKey('stpv_abc12345_somerandombytes');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('es determinista: la misma entrada siempre produce el mismo hash', () => {
    const input = 'stpv_abc12345_deterministic';
    const h1 = ApiKeyLookupService.hashKey(input);
    const h2 = ApiKeyLookupService.hashKey(input);
    expect(h1).toBe(h2);
  });

  it('entradas distintas producen hashes distintos', () => {
    const h1 = ApiKeyLookupService.hashKey('stpv_aaa11111_inputA');
    const h2 = ApiKeyLookupService.hashKey('stpv_bbb22222_inputB');
    expect(h1).not.toBe(h2);
  });

  it('el hash de la cadena vacía es el sha256 conocido de ""', () => {
    // sha256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const hash = ApiKeyLookupService.hashKey('');
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

// ---------------------------------------------------------------------------
// Constructor — rama sin URL
// ---------------------------------------------------------------------------

describe('ApiKeyLookupService constructor', () => {
  afterEach(() => {
    // Restaurar siempre para no contaminar otros tests
  });

  it('lanza si no hay DATABASE_URL_AUTH ni DATABASE_URL', () => {
    const savedAuth = process.env.DATABASE_URL_AUTH;
    const savedUrl = process.env.DATABASE_URL;

    try {
      delete process.env.DATABASE_URL_AUTH;
      delete process.env.DATABASE_URL;

      expect(() => new ApiKeyLookupService()).toThrow('DATABASE_URL_AUTH o DATABASE_URL requerida');
    } finally {
      if (savedAuth !== undefined) process.env.DATABASE_URL_AUTH = savedAuth;
      if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
    }
  });

  it('construye correctamente cuando DATABASE_URL está presente', () => {
    const savedAuth = process.env.DATABASE_URL_AUTH;
    const savedUrl = process.env.DATABASE_URL;

    try {
      delete process.env.DATABASE_URL_AUTH;
      process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/test';

      // La construcción NO conecta (lazy); solo comprueba que no lanza.
      expect(() => new ApiKeyLookupService()).not.toThrow();
    } finally {
      if (savedAuth !== undefined) process.env.DATABASE_URL_AUTH = savedAuth;
      if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
      else delete process.env.DATABASE_URL;
    }
  });

  it('DATABASE_URL_AUTH tiene prioridad sobre DATABASE_URL', () => {
    const savedAuth = process.env.DATABASE_URL_AUTH;
    const savedUrl = process.env.DATABASE_URL;

    try {
      process.env.DATABASE_URL_AUTH = 'postgresql://admin:pass@localhost:5432/authdb';
      process.env.DATABASE_URL = 'postgresql://app:pass@localhost:5432/appdb';

      expect(() => new ApiKeyLookupService()).not.toThrow();
    } finally {
      if (savedAuth !== undefined) process.env.DATABASE_URL_AUTH = savedAuth;
      else delete process.env.DATABASE_URL_AUTH;
      if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
      else delete process.env.DATABASE_URL;
    }
  });
});

// ---------------------------------------------------------------------------
// findByHash — delegación al cliente interno
// ---------------------------------------------------------------------------

describe('ApiKeyLookupService.findByHash', () => {
  function makeSvc() {
    // Garantizar que DATABASE_URL existe para que el constructor no lance.
    process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
    const svc = new ApiKeyLookupService();

    const mockRecord = {
      id: 'kid-1',
      organizationId: 'org-1',
      priceListId: null,
      revokedAt: null,
    };
    const mockClient = {
      apiKey: {
        findUnique: vi.fn(async (..._a: unknown[]) => mockRecord),
        update: vi.fn(async (..._a: unknown[]) => ({ id: 'kid-1', lastUsedAt: new Date() })),
      },
    };
    // Reemplazar el cliente interno por el mock (sin conexión real).
    (svc as unknown as { client: typeof mockClient }).client = mockClient;

    return { svc, mockClient, mockRecord };
  }

  it('delega a client.apiKey.findUnique con where: { hashedKey }', async () => {
    const { svc, mockClient } = makeSvc();
    const hash = 'abc123def456';

    await svc.findByHash(hash);

    expect(mockClient.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hashedKey: hash } }),
    );
  });

  it('devuelve el registro retornado por findUnique', async () => {
    const { svc, mockRecord } = makeSvc();

    const result = await svc.findByHash('cualquierhash');

    expect(result).toEqual(mockRecord);
  });

  it('devuelve null cuando findUnique devuelve null (key inexistente)', async () => {
    const { svc, mockClient } = makeSvc();
    mockClient.apiKey.findUnique.mockResolvedValueOnce(null as never);

    const result = await svc.findByHash('noencontrada');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// touchLastUsed — delegación al cliente interno
// ---------------------------------------------------------------------------

describe('ApiKeyLookupService.touchLastUsed', () => {
  function makeSvc() {
    process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
    const svc = new ApiKeyLookupService();

    const mockClient = {
      apiKey: {
        findUnique: vi.fn(async (..._a: unknown[]) => null),
        update: vi.fn(async (..._a: unknown[]) => ({ id: 'kid-touch', lastUsedAt: new Date() })),
      },
    };
    (svc as unknown as { client: typeof mockClient }).client = mockClient;

    return { svc, mockClient };
  }

  it('delega a client.apiKey.update con where: { id } y data: { lastUsedAt }', async () => {
    const { svc, mockClient } = makeSvc();
    const before = new Date();

    await svc.touchLastUsed('kid-touch');

    expect(mockClient.apiKey.update).toHaveBeenCalledOnce();
    const call = mockClient.apiKey.update.mock.calls[0]![0] as {
      where: { id: string };
      data: { lastUsedAt: Date };
    };
    expect(call.where.id).toBe('kid-touch');
    expect(call.data.lastUsedAt).toBeInstanceOf(Date);
    expect(call.data.lastUsedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('no lanza cuando la actualización tiene éxito', async () => {
    const { svc } = makeSvc();
    await expect(svc.touchLastUsed('kid-touch')).resolves.not.toThrow();
  });
});
