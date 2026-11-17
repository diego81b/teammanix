import { resolve } from 'node:path';
import { parseEnvName, writeKeys } from './gen-keys';

/** `npm run keys:gen -- [dev|staging|prod]` (default dev): thin shell around writeKeys. Writes to `secrets/<env>/` in the repository root. */
function main() {
  const env = parseEnvName(process.argv.slice(2));
  const root = resolve(__dirname, '..', '..', '..', '..');
  const r = writeKeys(root, env);
  console.log(`Keys generated (env=${env}):`);
  console.log(`  JWT secret:  ${r.jwtSecretFile}`);
  console.log(`  storage key: ${r.storageKeyFile}`);
  if (r.envFile) console.log(`Paste the variables into Coolify: ${r.envFile}`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
