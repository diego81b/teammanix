import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PASSWORD = 'password-long-123';

export interface Environment {
  app: NestFastifyApplication;
  orm: MikroORM;
  /** Temporary folder for encrypted files, removed on close. */
  storageDir: string;
  mail: { outbox: { to: string; subject: string; text: string }[] };
  close: () => Promise<void>;
  req: (method: string, url: string, options?: { body?: unknown; token?: string }) => Promise<{ status: number; body: any }>;
  /** Registers, verifies and logs in. Returns the session. */
  newUser: (email: string, name?: string) => Promise<any>;
  tokenFromMail: (to: string, subject?: string) => string;
  tokenInvitation: (to: string) => string;
}

export async function startEnvironment(): Promise<Environment> {
  const pg: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
  process.env.DATABASE_URL = pg.getConnectionUri();
  process.env.JWT_SECRET = 'secret-of-test-long-almeno-trentadue-caratteri';
  process.env.NODE_ENV = 'test';
  const storageDir = await mkdtemp(join(tmpdir(), 'tm-int-storage-'));
  process.env.STORAGE_DIR = storageDir;

  // Import after setting the environment: the configuration is read when the app is created.
  const { createApp } = await import('../src/create-app');
  const { MailService } = await import('../src/mail/mail.service');
  const app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const orm = app.get(MikroORM);
  await orm.schema.refreshDatabase();
  const mail = app.get(MailService);

  const req: Environment['req'] = async (method, url, options = {}) => {
    const r = await app.inject({
      method: method as 'GET',
      url: `/api${url}`,
      headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
      ...(options.body !== undefined ? { payload: options.body as object } : {}),
    });
    let body: unknown = r.body;
    try {
      body = r.body ? JSON.parse(r.body) : null;
    } catch {
      /* non-JSON body */
    }
    return { status: r.statusCode, body };
  };

  const tokenFromMail = (to: string, subject = ''): string => {
    const m = [...mail.outbox].reverse().find((x) => x.to === to.toLowerCase() && x.subject.startsWith(subject));
    const t = m && /token=(\S+)/.exec(m.text)?.[1];
    if (!t) throw new Error(`no mail with token for ${to}`);
    return t;
  };

  const tokenInvitation = (to: string) => tokenFromMail(to, 'Invito');

  const newUser = async (email: string, name = 'Mario') => {
    const r = await req('POST', '/auth/registration', {
      body: { email, password: PASSWORD, name, surname: 'Rossi', acceptTerms: true },
    });
    if (r.status !== 202) throw new Error(`registrazione ${r.status} ${JSON.stringify(r.body)}`);
    const v = await req('POST', '/auth/verify-email', { body: { token: tokenFromMail(email) } });
    if (v.status !== 200) throw new Error(`verifica ${v.status}`);
    const l = await req('POST', '/auth/login', { body: { email, password: PASSWORD } });
    if (l.status !== 200) throw new Error(`login ${l.status} ${JSON.stringify(l.body)}`);
    return l.body;
  };

  return {
    app,
    orm,
    storageDir,
    mail,
    req,
    newUser,
    tokenFromMail,
    tokenInvitation,
    close: async () => {
      await app.close();
      await pg.stop();
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}
