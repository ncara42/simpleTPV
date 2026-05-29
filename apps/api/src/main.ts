import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import { parseCorsOrigins } from './config/security.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['warn', 'error', 'log'],
  });

  // Cabeceras de seguridad (helmet). CSP desactivada: la API sirve JSON + la UI de
  // Swagger en /docs, y una CSP estricta por defecto rompería esa UI. El resto de
  // protecciones (nosniff, HSTS, frameguard, etc.) quedan activas.
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS por allowlist (env CORS_ORIGINS, CSV). En dev, orígenes de los frontends.
  app.enableCors({
    origin: parseCorsOrigins(process.env.CORS_ORIGINS),
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

  // Swagger/OpenAPI (#48). UI servida en `docs` (tras el proxy de los frontends
  // queda accesible en /api/docs). Auth Bearer documentada para probar endpoints.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('simpleTPV API')
    .setDescription('API multi-tienda: ventas, stock, traspasos, compras, VeriFactu.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`API escuchando en :${port} (Swagger en /docs)`);
}

bootstrap().catch((err) => {
  console.error('Fallo arrancando API:', err);
  process.exit(1);
});
