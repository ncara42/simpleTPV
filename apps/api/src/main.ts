import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import { resolveCorsOrigins, trustProxyHops } from './config/security.js';
import { initSentry } from './observability/sentry.js';

async function bootstrap(): Promise<void> {
  // Sentry debe instrumentar el runtime antes de crear la app (#79).
  // No-op si no hay SENTRY_DSN o no estamos en producción.
  initSentry();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['warn', 'error', 'log'],
  });

  // Detrás del proxy (nginx de los frontends + ingress de Dokploy): confiar en los
  // saltos de proxy para que req.ip resuelva la IP real del cliente. Sin esto, el
  // rate limiting por IP (incluido el de login 5/min) agruparía a TODOS los
  // clientes bajo la IP del proxy, dejándolo inútil (auditoría SEC-08).
  app.set('trust proxy', trustProxyHops(process.env));

  // Límite explícito del body JSON: backstop de DoS por payloads grandes (los
  // arrays de líneas además están acotados con @ArrayMaxSize en los DTOs, SEC-10).
  app.useBodyParser('json', { limit: '512kb' });

  // Cabeceras de seguridad (helmet). CSP desactivada: la API sirve JSON + la UI de
  // Swagger en /docs, y una CSP estricta por defecto rompería esa UI. El resto de
  // protecciones (nosniff, HSTS, frameguard, etc.) quedan activas.
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS por allowlist (env CORS_ORIGINS, CSV). En dev, orígenes de los frontends.
  app.enableCors({
    origin: resolveCorsOrigins(process.env),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta propiedades no declaradas en el DTO
      forbidNonWhitelisted: true, // y rechaza la request si las trae
      transform: true, // instancia el DTO y convierte tipos primitivos
    }),
  );

  // Swagger/OpenAPI (#48). Solo FUERA de producción: publicar el contrato completo
  // (rutas, DTOs, validaciones) en prod facilita el reconocimiento a un atacante
  // (SEC-17). En dev/staging queda servido en `docs` (tras el proxy, /api/docs).
  const swaggerEnabled = process.env.NODE_ENV !== 'production';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('simpleTPV API')
      .setDescription('API multi-tienda: ventas, stock, traspasos, compras, VeriFactu.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(
    `API escuchando en :${port}${swaggerEnabled ? ' (Swagger en /docs)' : ' (Swagger desactivado en producción)'}`,
  );
}

bootstrap().catch((err) => {
  console.error('Fallo arrancando API:', err);
  process.exit(1);
});
