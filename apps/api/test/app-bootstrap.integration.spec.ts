// Verifica que el módulo Nest completo resuelve toda su DI, arranca, y que los
// guards globales se comportan: /health público, rutas protegidas exigen auth.
// Pilla errores de inyección y de orden/configuración de guards que los tests
// unitarios (instancian a mano) no detectan.
//
// Requisitos: misma BD que los otros tests de integración (DATABASE_URL_*).

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

describe('AppModule bootstrap + guards globales', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  it('arranca y resuelve toda la DI', () => {
    expect(app).toBeDefined();
  });

  it('GET /health es público (200 sin token)', async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
  });

  it('GET /products exige autenticación (401 sin token)', async () => {
    const res = await fetch(`${url}/products`);
    expect(res.status).toBe(401);
  });
});
