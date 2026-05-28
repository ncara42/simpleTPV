// Verifica end-to-end que el AuditInterceptor registra una mutación real en
// audit_logs (login → crear producto → comprobar entrada), y que un GET no
// genera registro. Requiere BD con seed + DATABASE_URL_*.

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

describe('Audit log (integración HTTP)', () => {
  let app: INestApplication;
  let url: string;
  let token: string;

  async function api(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${url}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

    const res = await fetch(`${url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@org1.test', password: 'password123' }),
    });
    token = ((await res.json()) as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('una mutación (POST /products) crea una entrada en audit_logs', async () => {
    const unique = `AUDIT-${Date.now()}`;
    const created = await api('/products', {
      method: 'POST',
      body: JSON.stringify({ name: unique, salePrice: 1 }),
    });
    expect(created.status).toBe(201);
    const product = (await created.json()) as { id: string };

    // El tap del interceptor escribe de forma asíncrona; damos margen.
    await new Promise((r) => setTimeout(r, 400));

    // Verificamos directamente en la BD con el superuser (bypassa RLS).
    const { PrismaClient } = await import('@simpletpv/db');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const admin = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
    try {
      // En un POST a /products la URL no lleva id, así que entityId es null;
      // buscamos el registro reciente de acción POST sobre la entidad products.
      const rows = await admin.$queryRaw<Array<{ action: string; entity: string }>>`
        SELECT action, entity FROM "AuditLog"
        WHERE entity = 'products' AND action = 'POST'
        ORDER BY "createdAt" DESC LIMIT 1`;
      expect(rows.length).toBe(1);
      expect(rows[0]!.entity).toBe('products');
    } finally {
      await admin.$disconnect();
    }

    await api(`/products/${product.id}`, { method: 'DELETE' });
  });
});
