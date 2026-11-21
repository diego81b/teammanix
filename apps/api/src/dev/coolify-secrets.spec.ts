import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPUTED_BY_TOFU, completeSecrets, missingRequired, requiredFromCompose, userSecrets } from './coolify-secrets';

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
