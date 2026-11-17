import { createHash } from 'node:crypto';
import { keyRing, type KeyRing } from '../storage/encryption';
import type { ConfigS3 } from '../storage/storage-s3';

/** Version of the accepted legal documents (terms, privacy, DPA). Update on every revision of the texts. */
export const DOCUMENTS_VERSION = '2026-11-05';

export const INVITATION_DAYS = 7;

export interface AppConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  appUrl: string;
  allowedOrigins: string[];
  /** `filesystem` for development and test, `s3` (any compatible service) in production. */
  storageDriver: 'filesystem' | 's3';
  /** Folder of the encrypted files, filesystem driver only. */
  storageDir: string;
  /** Present only with the s3 driver. */
  s3: ConfigS3 | null;
  /** The key that writes plus the previous ones that stay readable (envelope encryption, see storage/encryption.ts). */
  storageKeys: KeyRing;
}

function driverStorage(): 'filesystem' | 's3' {
  const production = process.env.NODE_ENV === 'production';
  const driver = process.env.STORAGE_DRIVER ?? (production ? 's3' : 'filesystem');
  if (driver !== 'filesystem' && driver !== 's3') throw new Error('STORAGE_DRIVER must be filesystem or s3');
  if (production && driver !== 's3') throw new Error('STORAGE_DRIVER must be s3 in production');
  return driver;
}

function configS3(): ConfigS3 {
  const missing = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`With STORAGE_DRIVER=s3 missing: ${missing.join(', ')}`);
  return {
    endpoint: (process.env.S3_ENDPOINT as string).replace(/\/$/, ''),
    region: process.env.S3_REGION || 'auto',
    bucket: process.env.S3_BUCKET as string,
    accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
  };
}

/**
 * STORAGE_ENCRYPTION_KEY: 32 bytes in base64. Required in production. Outside production, if missing, it is derived from
 * JWT_SECRET so development and tests work without other configuration.
 * STORAGE_ENCRYPTION_KEY_PREVIOUS: optional, comma separated, the keys that stay readable during a rotation until
 * `npm run storage:rewrap` has moved every object to the current key.
 */
function storageKeyRing(jwtSecret: string): KeyRing {
  const raw = process.env.STORAGE_ENCRYPTION_KEY;
  let current: Buffer;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('STORAGE_ENCRYPTION_KEY required in production');
    current = createHash('sha256').update(`storage:${jwtSecret}`).digest();
  } else {
    current = Buffer.from(raw, 'base64');
    if (current.length !== 32) throw new Error('STORAGE_ENCRYPTION_KEY must be 32 bytes in base64');
  }
  const previous = (process.env.STORAGE_ENCRYPTION_KEY_PREVIOUS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => Buffer.from(k, 'base64'));
  if (previous.some((k) => k.length !== 32)) throw new Error('STORAGE_ENCRYPTION_KEY_PREVIOUS must list keys of 32 bytes in base64');
  try {
    return keyRing(current, previous);
  } catch {
    throw new Error('STORAGE_ENCRYPTION_KEY_PREVIOUS must not repeat a key');
  }
}

/** Read on every call, not cached: tests set the variables before creating the app. */
export function appConfig(): AppConfig {
  const jwtSecret = process.env.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET missing or shorter than 32 characters');
  }
  const storageKeys = storageKeyRing(jwtSecret);
  const storageDriver = driverStorage();
  return {
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
    appUrl: (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim()),
    storageKeys,
    storageDriver,
    storageDir: process.env.STORAGE_DIR ?? './storage',
    s3: storageDriver === 's3' ? configS3() : null,
  };
}
