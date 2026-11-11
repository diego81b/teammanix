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
 * Dedup key of the staff digest: one per club and week (Monday to Sunday) for the admin's digest of the club, and one
 * per club, week and season for the digest of a team. The digest says where the club or the team stands, so it needs no
 * memory of what it said before, and it also covers players without an account. The key of the club digest has no
 * season and is the one the digest had before it went per team, so the week of the release does not send it twice.
 */
export function digestKey(clubId: string, today: string, seasonId?: string): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - sinceMonday);
  const week = `cert-due:${clubId}:${date.toISOString().slice(0, 10)}`;
  return seasonId ? `${week}:${seasonId}` : week;
}

/** A team a player plays in: where the policy applies, and the season whose page lists the player, with the team name. */
export interface AlertTarget extends Target {
  seasonId: string;
  teamName: string;
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

/** One notification to one account: for the whole club (`seasonId` and `team` null) or for one team. */
export interface Digest {
  userId: string;
  seasonId: string | null;
  team: string | null;
  expiring: number;
  expired: number;
  /** Where the notification opens: the people list for the club digest, the page of the team for a team digest. */
  link: string;
}

/**
 * What each staff account is told: how many of the people it may see have a certificate expiring or expired. Only
 * counts, never names: the notification shows on a lock screen, and a count and the page it opens must agree, so a
 * digest counts the people of one team and opens the page of that team. The permission is `certificates.status` in the
 * team, and the certificate belongs to the person: someone who plays in two teams counts in the digest of each.
 *
 * The admin gets one digest for the whole club (a person counts once), opening the people list, also when they coach.
 * Everyone else gets one digest for each team of their scope with at least one person due, however many sources of the
 * permission cover it. Teams with nobody due send nothing. Order: by account, then by season id.
 */
export function staffDigests(candidates: readonly StaffCandidate[], alerted: readonly AlertedPerson[]): Digest[] {
  const digests: Digest[] = [];
  for (const c of candidates) {
    if (c.sources.some((s) => s.role === 'admin')) {
      const seen = alerted.filter((p) => p.targets.some((t) => can(c.sources, c.diff, 'certificates.status', t)));
      const club = tally(seen);
      if (club.expiring + club.expired > 0) digests.push({ userId: c.userId, seasonId: null, team: null, ...club, link: '/people' });
      continue;
    }
    const perSeason = new Map<string, { team: string; people: AlertedPerson[] }>();
    for (const p of alerted) {
      for (const t of p.targets) {
        if (!can(c.sources, c.diff, 'certificates.status', t)) continue;
        const entry = perSeason.get(t.seasonId) ?? { team: t.teamName, people: [] };
        if (!entry.people.includes(p)) entry.people.push(p);
        perSeason.set(t.seasonId, entry);
      }
    }
    for (const [seasonId, { team, people }] of perSeason) {
      digests.push({ userId: c.userId, seasonId, team, ...tally(people), link: `/team-certificates/${seasonId}` });
    }
  }
  return digests.sort((a, b) => a.userId.localeCompare(b.userId) || (a.seasonId ?? '').localeCompare(b.seasonId ?? ''));
}

function tally(people: readonly AlertedPerson[]): { expiring: number; expired: number } {
  const expired = people.filter((p) => p.bucket === 'expired').length;
  return { expiring: people.length - expired, expired };
}
