import type { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@simpletpv/db';
import { describe, expect, it, vi } from 'vitest';

import { PrismaExceptionFilter } from './prisma-exception.filter.js';

function makeHost() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: 'test',
    ...(meta ? { meta } : {}),
  });
}

describe('PrismaExceptionFilter', () => {
  it('P2002 (unique) → 409 con mensaje genérico (sin nombre de columna)', () => {
    const { host, status, json } = makeHost();
    new PrismaExceptionFilter().catch(prismaError('P2002', { target: ['email'] }), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0]![0]).toMatchObject({
      statusCode: 409,
      message: 'Ya existe un registro con esos datos',
    });
  });

  it('P2002 no filtra el nombre de columna interno (p.ej. hashedKey)', () => {
    const { host, json } = makeHost();
    new PrismaExceptionFilter().catch(prismaError('P2002', { target: ['hashedKey'] }), host);
    const message = (json.mock.calls[0]![0] as { message: string }).message;
    expect(message).not.toContain('hashedKey');
  });

  it('P2003 (FK) → 409 con causa de registros relacionados', () => {
    const { host, status, json } = makeHost();
    new PrismaExceptionFilter().catch(prismaError('P2003'), host);
    expect(status).toHaveBeenCalledWith(409);
    expect((json.mock.calls[0]![0] as { message: string }).message).toContain('relacionados');
  });

  it('P2025 (no existe) → 404', () => {
    const { host, status } = makeHost();
    new PrismaExceptionFilter().catch(prismaError('P2025'), host);
    expect(status).toHaveBeenCalledWith(404);
  });

  it('código desconocido → 500 genérico', () => {
    const { host, status, json } = makeHost();
    new PrismaExceptionFilter().catch(prismaError('P9999'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect((json.mock.calls[0]![0] as { message: string }).message).toBe('Internal server error');
  });
});
