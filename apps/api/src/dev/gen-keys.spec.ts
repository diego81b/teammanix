import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newKeys, parseEnvName, writeKeys } from './gen-keys';

describe('gen-keys', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gen-keys-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  describe('parseEnvName', () => {
    it('defaults to dev', () => {
      expect(parseEnvName([])).toBe('dev');
    });
    it.each(['dev', 'staging', 'prod'])('accepts %s', (e) => {
      expect(parseEnvName([e])).toBe(e);
    });
    it('rejects an unknown environment', () => {
      expect(() => parseEnvName(['production'])).toThrow('Unknown environment');
    });
  });

  describe('newKeys', () => {
    it('returns a JWT secret of at least 32 characters and a storage key of 32 bytes in base64', () => {
      const k = newKeys();
      expect(k.jwtSecret.length).toBeGreaterThanOrEqual(32);
      expect(Buffer.from(k.storageKey, 'base64')).toHaveLength(32);
    });
    it('never repeats', () => {
      expect(newKeys().storageKey).not.toBe(newKeys().storageKey);
    });
  });

  describe('writeKeys', () => {
    it('writes the key files under secrets/<env>', () => {
      const r = writeKeys(root, 'dev');
      expect(readFileSync(r.jwtSecretFile, 'utf8')).toHaveLength(r.jwtSecret.length);
      expect(Buffer.from(readFileSync(r.storageKeyFile, 'utf8'), 'base64')).toHaveLength(32);
      expect(r.jwtSecretFile).toContain(join('secrets', 'dev'));
    });
    it('writes a Coolify env file for staging and prod only', () => {
      expect(existsSync(join(root, 'secrets', 'dev', 'coolify-env.txt'))).toBe(false);
      writeKeys(root, 'dev');
      expect(existsSync(join(root, 'secrets', 'dev', 'coolify-env.txt'))).toBe(false);
      const r = writeKeys(root, 'prod');
      const text = readFileSync(r.envFile as string, 'utf8');
      expect(text).toContain(`JWT_SECRET=${r.jwtSecret}`);
      expect(text).toContain(`STORAGE_ENCRYPTION_KEY=${r.storageKey}`);
    });
    it('refuses to overwrite an existing key and leaves it untouched', () => {
      mkdirSync(join(root, 'secrets', 'prod'), { recursive: true });
      const file = join(root, 'secrets', 'prod', 'storage_enc.key');
      writeFileSync(file, 'precious');
      expect(() => writeKeys(root, 'prod')).toThrow('Refusing to overwrite');
      expect(readFileSync(file, 'utf8')).toBe('precious');
      expect(existsSync(join(root, 'secrets', 'prod', 'jwt_secret.key'))).toBe(false);
    });
  });
});
