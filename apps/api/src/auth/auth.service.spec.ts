import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthService } from './auth.service.js';

const ORG = '11111111-1111-1111-1111-111111111111';

interface FakeUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'ADMIN' | 'MANAGER' | 'CLERK';
  active: boolean;
}

function makeUser(overrides: Partial<FakeUser> = {}): FakeUser {
  return {
    id: 'user-1',
    organizationId: ORG,
    email: 'admin@org1.test',
    name: 'Admin Org1',
    passwordHash: bcrypt.hashSync('password123', 10),
    role: 'ADMIN',
    active: true,
    ...overrides,
  };
}

function makeService(user: FakeUser | null): AuthService {
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        user && user.email === where.email ? user : null,
      findFirst: async ({ where }: { where: { id: string } }) =>
        user && user.id === where.id ? user : null,
    },
  };
  const jwt = new JwtService({ secret: 'test-access-secret' });
  return new AuthService(prisma as never, jwt, {
    accessSecret: 'test-access-secret',
    refreshSecret: 'test-refresh-secret',
    accessTtl: '15m',
    refreshTtl: '7d',
  });
}

describe('AuthService.validateUser', () => {
  let service: AuthService;
  beforeEach(() => {
    service = makeService(makeUser());
  });

  it('devuelve el usuario cuando email y password son correctos', async () => {
    const user = await service.validateUser('admin@org1.test', 'password123');
    expect(user).not.toBeNull();
    expect(user?.email).toBe('admin@org1.test');
    expect(user?.organizationId).toBe(ORG);
  });

  it('devuelve null con password incorrecto', async () => {
    const user = await service.validateUser('admin@org1.test', 'wrong');
    expect(user).toBeNull();
  });

  it('devuelve null si el email no existe', async () => {
    const user = await service.validateUser('nope@org1.test', 'password123');
    expect(user).toBeNull();
  });

  it('devuelve null si el usuario está inactivo', async () => {
    const svc = makeService(makeUser({ active: false }));
    const user = await svc.validateUser('admin@org1.test', 'password123');
    expect(user).toBeNull();
  });
});

describe('AuthService.login', () => {
  it('emite accessToken y refreshToken con claims userId, organizationId y role', async () => {
    const service = makeService(makeUser());
    const user = await service.validateUser('admin@org1.test', 'password123');
    const tokens = await service.login(user!);

    expect(typeof tokens.accessToken).toBe('string');
    expect(typeof tokens.refreshToken).toBe('string');

    const jwt = new JwtService({});
    const payload = jwt.decode(tokens.accessToken) as Record<string, unknown>;
    expect(payload.sub).toBe('user-1');
    expect(payload.organizationId).toBe(ORG);
    expect(payload.role).toBe('ADMIN');
  });
});

describe('AuthService.refresh', () => {
  it('con refreshToken válido emite un nuevo accessToken con los claims del usuario', async () => {
    const service = makeService(makeUser());
    const user = await service.validateUser('admin@org1.test', 'password123');
    const { refreshToken } = await service.login(user!);

    const result = await service.refresh(refreshToken);
    expect(typeof result.accessToken).toBe('string');

    const payload = new JwtService({}).decode(result.accessToken) as Record<string, unknown>;
    expect(payload.sub).toBe('user-1');
    expect(payload.organizationId).toBe(ORG);
    expect(payload.role).toBe('ADMIN');
  });

  it('lanza si el refreshToken es inválido', async () => {
    const service = makeService(makeUser());
    await expect(service.refresh('garbage.token.here')).rejects.toThrow();
  });
});
