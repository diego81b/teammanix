import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BACKUP_SECRETS,
  COMPUTED_BY_TOFU,
  askSecrets,
  completeSecrets,
  missingRequired,
  requiredFromCompose,
  tofuLocalList,
  userSecrets,
  withoutHclComments,
} from './coolify-secrets';

const root = join(__dirname, '..', '..', '..', '..');
const keys = { jwtSecret: 'jwt-new', storageKey: 'storage-new' };

describe('coolify-secrets', () => {
  describe('requiredFromCompose', () => {
    it('lists the variables that stop compose when unset', () => {
      const text = [
        'A: ${DATABASE_URL:?set DATABASE_URL}',
        'B: ${JWT_SECRET:?set JWT_SECRET}',
        'C: ${MAIL_FROM_NAME:-TeamManix}',
        'D: ${VAPID_PUBLIC_KEY:-}',
        'E: ${JWT_SECRET:?again}',
      ].join('\n');
      expect(requiredFromCompose(text)).toEqual(['DATABASE_URL', 'JWT_SECRET']);
    });
  });

  describe('completeSecrets', () => {
    it('fills only the generated keys that are missing', () => {
      const r = completeSecrets({ BREVO_API_KEY: 'k', JWT_SECRET: 'keep' }, keys);
      expect(r.secrets).toEqual({ BREVO_API_KEY: 'k', JWT_SECRET: 'keep', STORAGE_ENCRYPTION_KEY: 'storage-new' });
      expect(r.added).toEqual(['STORAGE_ENCRYPTION_KEY']);
    });
    it('treats an empty value as missing', () => {
      const r = completeSecrets({ JWT_SECRET: '', STORAGE_ENCRYPTION_KEY: 'keep' }, keys);
      expect(r.secrets.JWT_SECRET).toBe('jwt-new');
      expect(r.secrets.STORAGE_ENCRYPTION_KEY).toBe('keep');
    });
    it('does not mutate its input', () => {
      const existing = { BREVO_API_KEY: 'k' };
      completeSecrets(existing, keys);
      expect(existing).toEqual({ BREVO_API_KEY: 'k' });
    });
  });

  describe('missingRequired', () => {
    it('reports the required names that are absent or empty, in order', () => {
      expect(missingRequired({ A: 'x', B: '' }, ['A', 'B', 'C'])).toEqual(['B', 'C']);
    });
    it('is empty when everything is set', () => {
      expect(missingRequired({ A: 'x' }, ['A'])).toEqual([]);
    });
  });

  describe('userSecrets', () => {
    it('keeps the secrets of the user and drops what tofu computes', () => {
      const required = ['DATABASE_URL', 'APP_URL', 'ALLOWED_ORIGINS', 'JWT_SECRET', 'BREVO_API_KEY'];
      expect(userSecrets(required)).toEqual(['JWT_SECRET', 'BREVO_API_KEY']);
    });
  });

  describe('askSecrets', () => {
    it('adds an absent asked key as an empty string', () => {
      const r = askSecrets({ A: 'x' }, ['A', 'B']);
      expect(r.secrets).toEqual({ A: 'x', B: '' });
    });
    it('keeps existing values and lists the empty ones in the order asked', () => {
      const r = askSecrets({ C: 'keep', B: '' }, ['C', 'B', 'A']);
      expect(r.secrets).toEqual({ C: 'keep', B: '', A: '' });
      expect(r.missing).toEqual(['B', 'A']);
    });
    it('does not mutate its input', () => {
      const existing = { A: 'x' };
      askSecrets(existing, ['A', 'B']);
      expect(existing).toEqual({ A: 'x' });
    });
  });

  describe('tofuLocalList', () => {
    it('parses a single-line list with the padding that tofu fmt produces', () => {
      const hcl = ['locals {', '  other_name    = "x"', '  backup_keys    = ["A_ONE", "B_TWO"]', '}'].join('\n');
      expect(tofuLocalList(hcl, 'backup_keys')).toEqual(['A_ONE', 'B_TWO']);
    });
    it('parses a multi-line list', () => {
      const hcl = ['locals {', '  backup_keys = [', '    "A_ONE",', '    "B_TWO", # comment', '  ]', '}'].join('\n');
      expect(tofuLocalList(hcl, 'backup_keys')).toEqual(['A_ONE', 'B_TWO']);
    });
    it('throws when the local is absent', () => {
      expect(() => tofuLocalList('locals { other = ["A"] }', 'backup_keys')).toThrow('backup_keys');
    });
  });

  // The backup credentials must never reach the app: neither the compose file nor tofu may know them as app variables.
  describe('BACKUP_SECRETS', () => {
    it('are neither required by the compose file nor computed by tofu', () => {
      const compose = readFileSync(join(root, 'docker-compose.prod.yml'), 'utf8');
      expect(BACKUP_SECRETS.length).toBeGreaterThan(0);
      const appKeys = [...requiredFromCompose(compose), ...COMPUTED_BY_TOFU];
      expect(BACKUP_SECRETS.filter((n) => appKeys.includes(n))).toEqual([]);
    });
    it('are the names of the backup_keys local in infra/coolify/main.tf', () => {
      const main = readFileSync(join(root, 'infra', 'coolify', 'main.tf'), 'utf8');
      expect(tofuLocalList(main, 'backup_keys')).toEqual([...BACKUP_SECRETS]);
    });
  });

  describe('withoutHclComments', () => {
    it('drops line and block comments and keeps quoted strings that contain comment markers', () => {
      const hcl = ['a = 1 # one', 'b = "http://x#y" // two', '/* three', 'c = 3 */ d = 4', '// e = 5'].join('\n');
      const lines = withoutHclComments(hcl)
        .split('\n')
        .map((l) => l.trim());
      expect(lines).toEqual(['a = 1', 'b = "http://x#y"', 'd = 4', '']);
    });
  });

  // tofu test cannot see a depends_on, and the deployment reads local.app_env, not the variable resources: without the
  // explicit edge it could start before they exist and compose stops on ${VAR:?}.
  describe('infra/coolify/main.tf wiring', () => {
    const main = readFileSync(join(root, 'infra', 'coolify', 'main.tf'), 'utf8');
    const DEPENDS_ON = 'depends_on = [coolify_environment_variable.app]';
    const ERROR_MESSAGE = 'error_message = local.backup_error';

    const block = (hcl: string, header: string) => {
      const code = withoutHclComments(hcl);
      return code.slice(code.indexOf(header)).split(/^}/m)[0];
    };
    const deploysAfterEnvVars = (hcl: string) =>
      /depends_on\s*=\s*\[[^\]]*\bcoolify_environment_variable\.app\b[^\]]*\]/.test(
        block(hcl, 'resource "coolify_deployment" "app"'),
      );
    const raisesBackupError = (hcl: string) =>
      /error_message\s*=\s*local\.backup_error\b/.test(block(hcl, 'resource "coolify_s3_storage" "backup"'));

    it('deploys the application only after the per-key environment variables', () => {
      expect(deploysAfterEnvVars(main)).toBe(true);
    });
    it('raises the backup precondition with the text the tofu test checks', () => {
      expect(raisesBackupError(main)).toBe(true);
    });

    it.each([
      ['a # comment', (l: string) => `# ${l}`],
      ['a // comment', (l: string) => `// ${l}`],
      ['a block comment', (l: string) => `/* ${l} */`],
    ])('does not count the wiring lines commented out with %s', (_name, comment) => {
      expect(main).toContain(DEPENDS_ON);
      expect(main).toContain(ERROR_MESSAGE);
      expect(deploysAfterEnvVars(main.replace(DEPENDS_ON, comment(DEPENDS_ON)))).toBe(false);
      expect(raisesBackupError(main.replace(ERROR_MESSAGE, comment(ERROR_MESSAGE)))).toBe(false);
    });
  });

  // The workspace comes from TEAMMANIX_ENV, so the project and environment names must come from it too: a prod apply must
  // never create "teammanix-staging". tofu.ps1 cannot run in a test (it reads the Credential Manager), so its wiring is read as text.
  describe('infra/coolify environment selection', () => {
    const tofuPs1 = readFileSync(join(root, 'infra', 'coolify', 'tofu.ps1'), 'utf8');
    const variables = readFileSync(join(root, 'infra', 'coolify', 'variables.tf'), 'utf8');
    const environmentVariable = withoutHclComments(variables).split('variable "environment"')[1].split(/^}/m)[0];

    it('passes the environment of the workspace to tofu as TF_VAR_environment, and removes it on exit', () => {
      expect(tofuPs1).toMatch(/^\s*\$env:TF_VAR_environment\s*=\s*\$envName\s*$/m);
      expect(tofuPs1).toMatch(/\$names\s*=\s*@\([^)]*'TF_VAR_environment'/);
    });
    it('has no default for var.environment, so it cannot silently be staging', () => {
      expect(environmentVariable).not.toMatch(/^\s*default\s*=/m);
    });
    it('names the later environment prod, never production, in the script header and the variable description', () => {
      expect(tofuPs1).not.toMatch(/production/i);
      expect(variables).not.toMatch(/production/i);
    });
  });

  // The infra reads the same names: a new required variable in the compose file must reach secrets.json or tofu.
  describe('docker-compose.prod.yml', () => {
    it('has every required variable either computed by tofu or asked from the user', () => {
      const compose = readFileSync(join(__dirname, '..', '..', '..', '..', 'docker-compose.prod.yml'), 'utf8');
      const required = requiredFromCompose(compose);
      expect(required.length).toBeGreaterThan(5);
      const asked = [...userSecrets(required), ...COMPUTED_BY_TOFU.filter((n) => required.includes(n))];
      expect(asked.sort()).toEqual([...required].sort());
    });
  });
});
