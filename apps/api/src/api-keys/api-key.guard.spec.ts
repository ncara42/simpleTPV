import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ApiKeyGuard } from './api-key.guard.js';
import type { ApiKeyRecord } from './api-key-lookup.service.js';
import { ApiKeyLookupService } from './api-key-lookup.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Crea un ExecutionContext falso a partir de las cabeceras y el objeto req. */
const makeCtx = (headers: Record<string, unknown>, req: Record<string, unknown> = {}) =>
  ({
    switchToHttp: () => ({
      getRequest: () => Object.assign(req, { headers }),
    }),
  }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Registro de API key válido (no revocada). */
function makeRecord(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: 'key-id-1',
    organizationId: '11111111-1111-1111-1111-111111111111',
    priceListId: null,
    revokedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

/** Mock de ApiKeyLookupService. */
function makeLookup(record: ApiKeyRecord | null = makeRecord()) {
  return {
    findByHash: vi.fn(async () => record),
    touchLastUsed: vi.fn(async () => undefined),
  };
}

/** Key cruda válida para usar en las cabeceras. */
const VALID_KEY = 'stpv_abcd1234_somerandombyteshere123456789012';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiKeyGuard.canActivate', () => {
  it('lanza UnauthorizedException si no hay cabecera x-api-key', async () => {
    const guard = new ApiKeyGuard(makeLookup() as never);
    const ctx = makeCtx({});

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException si la cabecera x-api-key no es string', async () => {
    const guard = new ApiKeyGuard(makeLookup() as never);
    const ctx = makeCtx({ 'x-api-key': 12345 });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException si la key no empieza por stpv_', async () => {
    const guard = new ApiKeyGuard(makeLookup() as never);
    const ctx = makeCtx({ 'x-api-key': 'bearer_algo_que_no_es_stpv' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException si findByHash devuelve null (key desconocida)', async () => {
    const guard = new ApiKeyGuard(makeLookup(null) as never);
    const ctx = makeCtx({ 'x-api-key': VALID_KEY });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException si la key está revocada (revokedAt set)', async () => {
    const revoked = makeRecord({ revokedAt: new Date('2024-01-01') });
    const guard = new ApiKeyGuard(makeLookup(revoked) as never);
    const ctx = makeCtx({ 'x-api-key': VALID_KEY });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException si la key está caducada (expiresAt en el pasado)', async () => {
    const expired = makeRecord({ expiresAt: new Date(Date.now() - 1000) });
    const guard = new ApiKeyGuard(makeLookup(expired) as never);
    const ctx = makeCtx({ 'x-api-key': VALID_KEY });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('acepta una key con expiresAt en el futuro', async () => {
    const future = makeRecord({ expiresAt: new Date(Date.now() + 60_000) });
    const guard = new ApiKeyGuard(makeLookup(future) as never);
    const ctx = makeCtx({ 'x-api-key': VALID_KEY });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('no llama touchLastUsed si la key está caducada', async () => {
    const lookup = makeLookup(makeRecord({ expiresAt: new Date(Date.now() - 1000) }));
    const guard = new ApiKeyGuard(lookup as never);
    const ctx = makeCtx({ 'x-api-key': VALID_KEY });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(lookup.touchLastUsed).not.toHaveBeenCalled();
  });

  it('devuelve true para una key válida y activa', async () => {
    const lookup = makeLookup(makeRecord());
    const guard = new ApiKeyGuard(lookup as never);
    const ctx = makeCtx({ 'x-api-key': VALID_KEY });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
  });

  it('puebla req.user.organizationId con el organizationId del registro', async () => {
    const record = makeRecord({ organizationId: '22222222-2222-2222-2222-222222222222' });
    const lookup = makeLookup(record);
    const guard = new ApiKeyGuard(lookup as never);
    const req: Record<string, unknown> = {};
    const ctx = makeCtx({ 'x-api-key': VALID_KEY }, req);

    await guard.canActivate(ctx);

    expect((req['user'] as { organizationId: string }).organizationId).toBe(
      '22222222-2222-2222-2222-222222222222',
    );
  });

  it('puebla req.apiKey con organizationId, priceListId y apiKeyId', async () => {
    const record = makeRecord({
      id: 'kid-42',
      organizationId: '33333333-3333-3333-3333-333333333333',
      priceListId: 'pl-999',
    });
    const lookup = makeLookup(record);
    const guard = new ApiKeyGuard(lookup as never);
    const req: Record<string, unknown> = {};
    const ctx = makeCtx({ 'x-api-key': VALID_KEY }, req);

    await guard.canActivate(ctx);

    const apiKey = req['apiKey'] as {
      organizationId: string;
      priceListId: string | null;
      apiKeyId: string;
    };
    expect(apiKey.organizationId).toBe('33333333-3333-3333-3333-333333333333');
    expect(apiKey.priceListId).toBe('pl-999');
    expect(apiKey.apiKeyId).toBe('kid-42');
  });

  it('llama touchLastUsed con el id del registro tras validar correctamente', async () => {
    const record = makeRecord({ id: 'kid-touch' });
    const lookup = makeLookup(record);
    const guard = new ApiKeyGuard(lookup as never);
    const ctx = makeCtx({ 'x-api-key': VALID_KEY });

    await guard.canActivate(ctx);

    // touchLastUsed se dispara void (sin await), pero como el mock es síncrono
    // en el test el microtask ya se habrá resuelto antes de la siguiente línea.
    await Promise.resolve(); // deja correr la microtask
    expect(lookup.touchLastUsed).toHaveBeenCalledWith('kid-touch');
  });

  it('findByHash recibe el sha256 correcto de la key cruda', async () => {
    const lookup = makeLookup(makeRecord());
    const guard = new ApiKeyGuard(lookup as never);
    const ctx = makeCtx({ 'x-api-key': VALID_KEY });

    await guard.canActivate(ctx);

    const expectedHash = ApiKeyLookupService.hashKey(VALID_KEY);
    expect(lookup.findByHash).toHaveBeenCalledWith(expectedHash);
  });

  it('no propaga el error si touchLastUsed rechaza (catch silencioso)', async () => {
    const lookup = {
      findByHash: vi.fn(async () => makeRecord({ id: 'kid-fail' })),
      touchLastUsed: vi.fn(async () => {
        throw new Error('db down');
      }),
    };
    const guard = new ApiKeyGuard(lookup as never);
    const ctx = makeCtx({ 'x-api-key': VALID_KEY });

    // La autenticación es válida: el fallo de touchLastUsed no debe abortarla
    // ni dejar una unhandled rejection.
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await Promise.resolve(); // deja correr la microtask del .catch()
    expect(lookup.touchLastUsed).toHaveBeenCalledWith('kid-fail');
  });

  it('no llama touchLastUsed si la key es desconocida', async () => {
    const lookup = makeLookup(null);
    const guard = new ApiKeyGuard(lookup as never);
    const ctx = makeCtx({ 'x-api-key': VALID_KEY });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(lookup.touchLastUsed).not.toHaveBeenCalled();
  });

  it('no llama touchLastUsed si la key está revocada', async () => {
    const lookup = makeLookup(makeRecord({ revokedAt: new Date() }));
    const guard = new ApiKeyGuard(lookup as never);
    const ctx = makeCtx({ 'x-api-key': VALID_KEY });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(lookup.touchLastUsed).not.toHaveBeenCalled();
  });
});
