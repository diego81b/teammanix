import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { completeSecrets, missingRequired, requiredFromCompose, userSecrets } from './coolify-secrets';
import { parseEnvName, writeKeys } from './gen-keys';

/**
 * `npm run coolify:secrets -- [staging|prod]`: prepares `secrets/<env>/` for `infra/coolify`.
 * Reads `secrets.json` (flat NAME to value), adds the keys it can generate, lists what is still empty, creates the
 * Git deploy key and registers it on the repository (read only). Never overwrites a value or a key that exists.
 */
function main() {
  const env = parseEnvName(process.argv.slice(2));
  if (env === 'dev') throw new Error("Use 'staging' or 'prod'");
  const root = resolve(__dirname, '..', '..', '..', '..');
  const dir = join(root, 'secrets', env);
  mkdirSync(dir, { recursive: true });

  const required = requiredFromCompose(readFileSync(join(root, 'docker-compose.prod.yml'), 'utf8'));
  const file = join(dir, 'secrets.json');
  const existing: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};

  const { secrets, added } = completeSecrets(existing, readOrWriteKeys(root, env));
  for (const name of userSecrets(required)) secrets[name] ??= '';
  writeSecret(file, `${JSON.stringify(secrets, null, 2)}\n`);

  console.log(`${file}${added.length ? `: generated ${added.join(', ')}` : ''}`);
  const missing = missingRequired(secrets, userSecrets(required));
  if (missing.length) console.log(`Still to fill in: ${missing.join(', ')}`);

  ensureDeployKey(root, dir, env);
}

/** The key files of `keys:gen` are the record (README, key custody): reuse them, generate only when both are absent. */
function readOrWriteKeys(root: string, env: 'staging' | 'prod') {
  const dir = join(root, 'secrets', env);
  const jwtFile = join(dir, 'jwt_secret.key');
  const storageFile = join(dir, 'storage_enc.key');
  if (existsSync(jwtFile) && existsSync(storageFile)) {
    return {
      jwtSecret: readFileSync(jwtFile, 'utf8').trim(),
      storageKey: readFileSync(storageFile, 'utf8').trim(),
    };
  }
  const r = writeKeys(root, env);
  return { jwtSecret: r.jwtSecret, storageKey: r.storageKey };
}

function ensureDeployKey(root: string, dir: string, env: string) {
  const key = join(dir, 'deploy_key');
  if (existsSync(key)) return;
  execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', `coolify-${env}`, '-f', key], { stdio: 'ignore' });
  execFileSync('gh', ['repo', 'deploy-key', 'add', `${key}.pub`, '--title', `coolify-${env}`], {
    cwd: root,
    stdio: 'inherit',
  });
  console.log(`Deploy key created and registered read only: ${key}`);
}

function writeSecret(file: string, content: string): void {
  writeFileSync(file, content, { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows does not honor POSIX modes: the folder is gitignored and the files stay local.
  }
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
