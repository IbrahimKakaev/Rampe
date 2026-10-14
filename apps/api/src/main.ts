import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigError } from '@rampe/shared';

import { AppModule } from './app.module.js';
import { setupApp } from './app.setup.js';
import { loadConfig } from './config/app-config.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config));
  setupApp(app, { secureCookies: config.cookieSecure });
  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on port ${String(config.port)}`);
}

bootstrap().catch((error: unknown) => {
  // A configuration error is the operator's to fix: print it plainly, without a stack trace.
  console.error(error instanceof ConfigError ? error.message : error);
  process.exitCode = 1;
});
