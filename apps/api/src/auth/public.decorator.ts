import { SetMetadata } from '@nestjs/common';

// Marca una ruta como pública (sin AuthGuard). Usado en /auth/login y /auth/refresh.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
