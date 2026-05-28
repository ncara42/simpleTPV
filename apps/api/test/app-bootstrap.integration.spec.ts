// Verifica que el módulo Nest completo resuelve toda su DI y arranca.
// Pilla errores de inyección (p.ej. guards usados en @UseGuards cuyo
// constructor Nest no sabe resolver) que los tests unitarios no detectan
// porque instancian las clases a mano.
//
// Requisitos: misma BD que los otros tests de integración (DATABASE_URL_*).

import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

describe('AppModule bootstrap', () => {
  it('resuelve toda la DI y compila sin errores', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    expect(app).toBeDefined();
    await app.close();
  });
});
