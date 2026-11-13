import { outboxEnabled } from '../mail/outbox';

/**
 * Calls per minute allowed on sensitive routes (login, registration, reset). Strict in production; raised under test and
 * when the end to end outbox is on, since the e2e suite registers and logs in many users from one client within a minute.
 */
export function authLimit(env: Record<string, string | undefined>): number {
  return env.NODE_ENV === 'test' || outboxEnabled(env) ? 10_000 : 10;
}
