import { randomBytes } from 'node:crypto';
import { appConfig } from './app.config';
import { keyId } from '../storage/encryption';

const ENV = { ...process.env };
const SECRET = 'secret-of-test-long-almeno-trentadue-caratteri';

beforeEach(() => {
  process.env = { ...ENV, JWT_SECRET: SECRET };
  delete process.env.STORAGE_ENCRYPTION_KEY;
  delete process.env.STORAGE_ENCRYPTION_KEY_PREVIOUS;
  delete process.env.STORAGE_DIR;
  delete process.env.STORAGE_DRIVER;
  for (const k of ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) delete process.env[k];
});
afterAll(() => {
  process.env = ENV;
});

describe('appConfig, storage', () => {
  it('outside production the encryption key derives from JWT_SECRET and is stable', () => {
    process.env.NODE_ENV = 'development';
    const a = appConfig().storageKeys.current;
    expect(a.key).toHaveLength(32);
    expect(appConfig().storageKeys.current.key.equals(a.key)).toBe(true);
  });

  it('the default folder is ./storage, configurable with STORAGE_DIR', () => {
    process.env.NODE_ENV = 'development';
    expect(appConfig().storageDir).toBe('./storage');
    process.env.STORAGE_DIR = '/data/certificates';
    expect(appConfig().storageDir).toBe('/data/certificates');
  });

  it('accepts a 32-byte key in base64', () => {
    const k = randomBytes(32);
    process.env.NODE_ENV = 'development';
    process.env.STORAGE_ENCRYPTION_KEY = k.toString('base64');
    const ring = appConfig().storageKeys;
    expect(ring.current.key.equals(k)).toBe(true);
    expect(ring.current.id).toBe(keyId(k));
    expect(ring.previous).toEqual([]);
  });

  it('STORAGE_ENCRYPTION_KEY_PREVIOUS lists the keys that stay readable, comma separated', () => {
    const [cur, p1, p2] = [randomBytes(32), randomBytes(32), randomBytes(32)];
    process.env.NODE_ENV = 'development';
    process.env.STORAGE_ENCRYPTION_KEY = cur.toString('base64');
    process.env.STORAGE_ENCRYPTION_KEY_PREVIOUS = ` ${p1.toString('base64')}, ${p2.toString('base64')} `;
    const ring = appConfig().storageKeys;
    expect(ring.current.key.equals(cur)).toBe(true);
    expect(ring.previous.map((k) => k.key)).toEqual([p1, p2]);
  });

  it('a previous key that is not 32 bytes fails', () => {
    process.env.NODE_ENV = 'development';
    process.env.STORAGE_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.STORAGE_ENCRYPTION_KEY_PREVIOUS = randomBytes(16).toString('base64');
    expect(() => appConfig()).toThrow('STORAGE_ENCRYPTION_KEY_PREVIOUS');
  });

  it('the current key listed also as previous fails', () => {
    const k = randomBytes(32).toString('base64');
    process.env.NODE_ENV = 'development';
    process.env.STORAGE_ENCRYPTION_KEY = k;
    process.env.STORAGE_ENCRYPTION_KEY_PREVIOUS = k;
    expect(() => appConfig()).toThrow('STORAGE_ENCRYPTION_KEY_PREVIOUS');
  });

  it('in production without a key startup fails', () => {
    process.env.NODE_ENV = 'production';
    expect(() => appConfig()).toThrow('STORAGE_ENCRYPTION_KEY');
  });

  it('a key that is not 32 bytes fails, even outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.STORAGE_ENCRYPTION_KEY = randomBytes(16).toString('base64');
    expect(() => appConfig()).toThrow('STORAGE_ENCRYPTION_KEY');
  });
});

const S3 = {
  S3_ENDPOINT: 'https://account.eu.r2.cloudflarestorage.com',
  S3_BUCKET: 'teammanix',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
};

describe('appConfig, storage driver', () => {
  it('outside production the default is filesystem and no S3 variables are needed', () => {
    process.env.NODE_ENV = 'development';
    const c = appConfig();
    expect([c.storageDriver, c.s3]).toEqual(['filesystem', null]);
  });

  it('with STORAGE_DRIVER=s3 reads the configuration, default region auto', () => {
    process.env.NODE_ENV = 'development';
    process.env.STORAGE_DRIVER = 's3';
    Object.assign(process.env, S3);
    expect(appConfig().s3).toEqual({
      endpoint: S3.S3_ENDPOINT,
      region: 'auto',
      bucket: 'teammanix',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });
    process.env.S3_REGION = 'fsn1';
    expect(appConfig().s3?.region).toBe('fsn1');
  });

  it('with s3 and a missing variable startup fails naming it', () => {
    process.env.NODE_ENV = 'development';
    process.env.STORAGE_DRIVER = 's3';
    Object.assign(process.env, S3);
    delete process.env.S3_BUCKET;
    expect(() => appConfig()).toThrow('S3_BUCKET');
  });

  it('unknown driver: error', () => {
    process.env.NODE_ENV = 'development';
    process.env.STORAGE_DRIVER = 'ftp';
    expect(() => appConfig()).toThrow('STORAGE_DRIVER');
  });

  it('in production the default is s3 and without its variables startup fails', () => {
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    expect(() => appConfig()).toThrow('S3_ENDPOINT');
    Object.assign(process.env, S3);
    expect(appConfig().storageDriver).toBe('s3');
  });

  it('in production the filesystem is not allowed', () => {
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.STORAGE_DRIVER = 'filesystem';
    expect(() => appConfig()).toThrow('production');
  });
});
