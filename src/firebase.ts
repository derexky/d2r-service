import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import { AppModule } from './app.module.js';

const server = express();
let initialized = false;

const bootstrap = async () => {
  if (initialized) return;
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
  app.setGlobalPrefix('api');
  await app.init();
  initialized = true;
};

bootstrap();

export const api = onRequest({ invoker: 'public' }, server);
