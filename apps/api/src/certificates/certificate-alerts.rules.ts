import { can, type DiffPolicy, type Source, type Target } from '../permissions/policy';
import { DAYS_EXPIRING, daysUntil } from './certificate.rules';

/**
 * Alerts at 30 and 15 days before expiry (ANALISI), and one when it expires. A bucket is the tightest threshold the
 * certificate has crossed, so a run that finds it already inside 15 days sends the 15 day alert and never the 30 day one.
 * A certificate expired for more than 30 days is no longer news, so there is no alert for it.
 */
export type AlertBucket = '30d' | '15d' | 'expired';

export function alertBucket(expiry: string, today: string): AlertBucket | null {
  const rest = daysUntil(expiry, today);
  if (rest < -DAYS_EXPIRING) return null;
  if (rest < 0) return 'expired';
  if (rest <= 15) return '15d';
  if (rest <= 30) return '30d';
  return null;
}

/**
 * Dedup key of a person's alert. The expiry is in it so that a certificate whose date was corrected alerts again; a new
 * certificate has its own id.
 */
export const alertKey = (certificateId: string, expiry: string, bucket: AlertBucket): string => `cert:${certificateId}:${expiry}:${bucket}`;

/**
 * Dedup key of the staff digest: one per club and week (Monday to Sunday). The digest says where the club stands, so it
 * needs no memory of what it said before, and it also covers players without an account.
 */
export function digestKey(clubId: string, today: string): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - sinceMonday);
  return `cert-due:${clubId}:${date.toISOString().slice(0, 10)}`;
}

/** A team a player plays in: where the policy applies, and the season whose page lists the player. */
export interface AlertTarget extends Target {
  seasonId: string;
}

/** A player whose certificate crossed a threshold in this run, with the teams (targets) they play in. */
export interface AlertedPerson {
  personId: string;
  bucket: AlertBucket;
  targets: AlertTarget[];
}

/** An account that may hold the certificates permission: its sources in the club and its permission diff. */
export interface StaffCandidate {
  userId: string;
  sources: Source[];
  diff: DiffPolicy;
}

export interface Digest {
  expiring: number;
  expired: number;
  /** Where the notification opens: the people list for the admin, else the page of the team with most people due. */
  link: string;
}

/**
 * What each staff account is told: how many of the people it may see have a certificate expiring or expired. Only
 * counts, never names: the notification shows on a lock screen. The permission is `certificates.status` in the scope of
 * the person's teams, and a person counts once however many teams they play in. The admin keeps the people list; the
 * others open the team page, the one with most people due (the lowest season id on a tie).
 */
export function staffDigests(candidates: readonly StaffCandidate[], alerted: readonly AlertedPerson[]): Map<string, Digest> {
  const digests = new Map<string, Digest>();
  for (const c of candidates) {
    const digest: Digest = { expiring: 0, expired: 0, link: '/people' };
    const perSeason = new Map<string, number>();
    for (const p of alerted) {
      const seen = p.targets.filter((t) => can(c.sources, c.diff, 'certificates.status', t));
      if (seen.length === 0) continue;
      if (p.bucket === 'expired') digest.expired += 1;
      else digest.expiring += 1;
      for (const t of new Set(seen.map((x) => x.seasonId))) perSeason.set(t, (perSeason.get(t) ?? 0) + 1);
    }
    if (digest.expiring + digest.expired === 0) continue;
    if (!c.sources.some((s) => s.role === 'admin')) {
      const [best] = [...perSeason].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      digest.link = `/team-certificates/${(best as [string, number])[0]}`;
    }
    digests.set(c.userId, digest);
  }
  return digests;
}
