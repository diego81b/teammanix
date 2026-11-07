/**
 * Exposes outgoing mails to end to end tests, which have no real inbox to read tokens from.
 * Off by default; turns on only with E2E_OUTBOX=1 and never in production.
 */
export function outboxEnabled(env: Record<string, string | undefined>): boolean {
  return env.E2E_OUTBOX === '1' && env.NODE_ENV !== 'production';
}
