import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { MAX_FILE_SIZE } from './certificates/file.rules';
import { appConfig } from './config/app.config';

function messagesValidation(errors: ValidationError[]): string[] {
  return errors.flatMap((e) => [...Object.values(e.constraints ?? {}), ...messagesValidation(e.children ?? [])]);
}

export async function createApp(): Promise<NestFastifyApplication> {
  const cfg = appConfig(); // fails at startup if JWT_SECRET is missing
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: true }), {
    logger: process.env.NODE_ENV === 'test' ? false : ['log', 'warn', 'error'],
  });
  await app.register(helmet);
  // @fastify/cors allows only GET, HEAD and POST by default: PATCH and DELETE from the browser would fail at preflight.
  await app.register(cors, { origin: cfg.allowedOrigins, credentials: false, methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'] });
  // Certificate file upload: raw binary body. The real type and the 5 MB limit are checked by the
  // service with a coded error; here the cap is slightly higher just to avoid reading huge bodies into memory.
  const fastify = app.getHttpAdapter().getInstance();
  for (const type of ['application/pdf', 'image/jpeg', 'image/png']) {
    fastify.addContentTypeParser(type, { parseAs: 'buffer', bodyLimit: MAX_FILE_SIZE + 1024 * 1024 }, (_req: unknown, body: Buffer, done: (e: Error | null, b?: Buffer) => void) => done(null, body));
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Same format as the other errors: the frontend translates from the code, not from the class-validator text.
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({ message: messagesValidation(errors), code: 'INVALID_DATA' }),
    }),
  );
  app.setGlobalPrefix('api');
  return app;
}
