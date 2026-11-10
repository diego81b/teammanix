import { validIsoDate } from '../structure/season.rules';

/** Alerts at 30 and 15 days (ANALISI): from there on the certificate is "expiring". */
export const DAYS_EXPIRING = 30;

export type CertificateStatus = 'missing' | 'valid' | 'expiring' | 'expired';

const days = (iso: string): number => {
  const [a, m, g] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(a, m - 1, g) / 86_400_000;
};

/** Calendar days from `today` to `expiry`: negative once the expiry is past. */
export const daysUntil = (expiry: string, today: string): number => days(expiry) - days(today);

/** Status from the expiry of the current certificate. On the expiry day the certificate is still valid. */
export function certificateStatus(expiry: string | null, today: string): CertificateStatus {
  if (!expiry) return 'missing';
  const rest = days(expiry) - days(today);
  if (rest < 0) return 'expired';
  return rest <= DAYS_EXPIRING ? 'expiring' : 'valid';
}

/** Counts the certificate with the furthest expiry. */
export function currentCertificate<T extends { expiryDate: string }>(certificates: readonly T[]): T | null {
  return certificates.reduce<T | null>((best, c) => (!best || c.expiryDate > best.expiryDate ? c : best), null);
}

/** Existing ISO dates, issue not in the future, expiry equal to or after issue. */
export function validateCertificateDates(issue: unknown, expiry: unknown, today: string): 'INVALID_DATE_CERTIFICATE' | null {
  if (!validIsoDate(issue) || !validIsoDate(expiry)) return 'INVALID_DATE_CERTIFICATE';
  if (issue > today || expiry < issue) return 'INVALID_DATE_CERTIFICATE';
  return null;
}

export const todayIso = (): string => new Date().toISOString().slice(0, 10);
