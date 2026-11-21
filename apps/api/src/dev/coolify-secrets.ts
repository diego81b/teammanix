/** Variables that OpenTofu builds from the infrastructure, never typed by the user. */
export const COMPUTED_BY_TOFU: readonly string[] = ['DATABASE_URL', 'APP_URL', 'ALLOWED_ORIGINS'];

/** Variables the script generates when the secrets file does not have them. */
const GENERATED = ['JWT_SECRET', 'STORAGE_ENCRYPTION_KEY'] as const;

/** Names of the variables that stop `docker compose` when unset, that is `${NAME:?message}` in the compose file. */
export function requiredFromCompose(composeText: string): string[] {
  const names = [...composeText.matchAll(/\$\{([A-Z][A-Z0-9_]*):\?/g)].map((m) => m[1]);
  return [...new Set(names)];
}

/** Required variables the user (or the generator) must provide, without those tofu computes. */
export function userSecrets(required: readonly string[]): string[] {
  return required.filter((n) => !COMPUTED_BY_TOFU.includes(n));
}

/** Adds the generated keys that are missing or empty, keeps every other value as it is. */
export function completeSecrets(
  existing: Readonly<Record<string, string>>,
  keys: { jwtSecret: string; storageKey: string },
): { secrets: Record<string, string>; added: string[] } {
  const secrets = { ...existing };
  const generated: Record<(typeof GENERATED)[number], string> = {
    JWT_SECRET: keys.jwtSecret,
    STORAGE_ENCRYPTION_KEY: keys.storageKey,
  };
  const added: string[] = [];
  for (const name of GENERATED) {
    if (!secrets[name]) {
      secrets[name] = generated[name];
      added.push(name);
    }
  }
  return { secrets, added };
}

/** Required names that are absent or empty, in the order given. */
export function missingRequired(secrets: Readonly<Record<string, string>>, required: readonly string[]): string[] {
  return required.filter((n) => !secrets[n]);
}
