import type { Options } from 'argon2';

/**
 * Parameters for `argon2.hash`. Production and development keep the library defaults. Only `NODE_ENV=test` gets light
 * parameters: the integration suites register dozens of users per file, and at the default cost (about 0.4 s to hash and
 * 0.3 s to verify) the hashing dominates their run time. `verify` reads the parameters from the stored hash, so hashes made
 * with either cost keep verifying.
 */
export function hashOptions(nodeEnv: string | undefined): Options {
  return nodeEnv === 'test' ? { memoryCost: 1024, timeCost: 1, parallelism: 1 } : {};
}
