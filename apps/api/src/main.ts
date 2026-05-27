import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['warn', 'error', 'log'],
  });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`API escuchando en :${port}`);
}

bootstrap().catch((err) => {
  console.error('Fallo arrancando API:', err);
  process.exit(1);
});
