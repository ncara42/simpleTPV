import { ApiError } from '@simpletpv/auth';
import { describe, expect, it } from 'vitest';

import { formErrorMessage } from './form-error.js';

describe('formErrorMessage', () => {
  it('devuelve la causa real cuando ApiError trae cuerpo', () => {
    const e = new ApiError(400, 'el email ya existe');
    expect(formErrorMessage(e, 'No se pudo guardar.')).toBe('el email ya existe');
  });

  it('los mensajes múltiples de class-validator llegan unidos (api-client)', () => {
    const e = new ApiError(400, 'name should not be empty, price must be a number');
    expect(formErrorMessage(e, 'x')).toBe('name should not be empty, price must be a number');
  });

  it('cae al fallback sin cuerpo o con error no-API', () => {
    expect(formErrorMessage(new ApiError(500), 'No se pudo guardar.')).toBe('No se pudo guardar.');
    expect(formErrorMessage(new Error('boom'), 'No se pudo guardar.')).toBe('No se pudo guardar.');
    expect(formErrorMessage(undefined, 'No se pudo guardar.')).toBe('No se pudo guardar.');
  });
});
