import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type EnvName = 'dev' | 'staging' | 'prod';
const ENVS: readonly string[] = ['dev', 'staging', 'prod'];

export interface GeneratedKeys {
  jwtSecret: string;
  storageKey: string;
  jwtSecretFile: string;
  storageKeyFile: string;
  /** Ready-to-paste Coolify variables, only for staging and prod. */
  envFile?: string;
}

export function parseEnvName(args: string[]): EnvName {
  const name = args[0] ?? 'dev';
  if (!ENVS.includes(name)) throw new Error(`Unknown environment '${name}'. Use: dev | staging | prod`);
  return name as EnvName;
}

/** JWT secret: 48 random bytes in base64 (64 characters). Storage key: 32 random bytes in base64 (AES-256). */
export function newKeys(): { jwtSecret: string; storageKey: string } {
  return { jwtSecret: randomBytes(48).toString('base64'), storageKey: randomBytes(32).toString('base64') };
}

/**
 * Writes the keys of one environment under `<root>/secrets/<env>/`. Refuses to overwrite: delete the files by hand to rotate,
 * knowing that a new storage key makes every stored file unreadable (see the key custody section of README.md).
 */
export function writeKeys(root: string, env: EnvName): GeneratedKeys {
  const dir = join(root, 'secrets', env);
  const jwtSecretFile = join(dir, 'jwt_secret.key');
  const storageKeyFile = join(dir, 'storage_enc.key');
  const existing = [jwtSecretFile, storageKeyFile].filter((f) => existsSync(f));
  if (existing.length) {
    throw new Error(`Refusing to overwrite. Existing key files:\n${existing.map((f) => `  - ${f}`).join('\n')}`);
  }
  mkdirSync(dir, { recursive: true });
  const keys = newKeys();
  writeSecret(jwtSecretFile, keys.jwtSecret);
  writeSecret(storageKeyFile, keys.storageKey);
  const result: GeneratedKeys = { ...keys, jwtSecretFile, storageKeyFile };
  if (env !== 'dev') {
    const envFile = join(dir, 'coolify-env.txt');
    writeSecret(
      envFile,
      [
        `# TeamManix ${env}: Coolify variables. Plaintext secrets, never commit. The source of truth is the .key files here.`,
        `JWT_SECRET=${keys.jwtSecret}`,
        `STORAGE_ENCRYPTION_KEY=${keys.storageKey}`,
        '',
      ].join('\n'),
    );
    result.envFile = envFile;
  }
  return result;
}

function writeSecret(file: string, content: string): void {
  writeFileSync(file, content, { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows does not honor POSIX modes: the folder is gitignored and the files stay local.
  }
}
