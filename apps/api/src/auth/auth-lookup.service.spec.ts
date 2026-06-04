import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mockeamos el cliente Prisma y el adapter PG (con clases, constructables) para no
// abrir conexión real: el servicio solo debe construir el cliente y delegar en él.
const { findUnique, findFirst, $disconnect } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  $disconnect: vi.fn(),
}));

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class {},
}));
vi.mock('@simpletpv/db', () => ({
  PrismaClient: class {
    user = { findUnique, findFirst };
    $disconnect = $disconnect;
  },
}));

import { AuthLookupService } from './auth-lookup.service.js';

const ORIGINAL = { auth: process.env.DATABASE_URL_AUTH, url: process.env.DATABASE_URL };

describe('AuthLookupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL_AUTH = 'postgres://app_admin@localhost:5434/test';
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.env.DATABASE_URL_AUTH = ORIGINAL.auth;
    process.env.DATABASE_URL = ORIGINAL.url;
  });

  it('lanza si no hay URL de auth ni de fallback', () => {
    delete process.env.DATABASE_URL_AUTH;
    delete process.env.DATABASE_URL;
    expect(() => new AuthLookupService()).toThrow(/DATABASE_URL_AUTH/);
  });

  it('usa DATABASE_URL como fallback si falta la de auth', () => {
    delete process.env.DATABASE_URL_AUTH;
    process.env.DATABASE_URL = 'postgres://app@localhost:5434/test';
    expect(() => new AuthLookupService()).not.toThrow();
  });

  it('delega user.findUnique y user.findFirst en el cliente', async () => {
    findUnique.mockResolvedValue({ id: 'u1' });
    findFirst.mockResolvedValue(null);
    const svc = new AuthLookupService();

    await expect(svc.user.findUnique({ where: { email: 'a@b.c' } })).resolves.toEqual({ id: 'u1' });
    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.c' } });

    await expect(svc.user.findFirst({ where: { id: 'u1' } })).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });

  it('cierra la conexión en onModuleDestroy', async () => {
    const svc = new AuthLookupService();
    await svc.onModuleDestroy();
    expect($disconnect).toHaveBeenCalledOnce();
  });
});
