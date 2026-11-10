import { certificateStatus, daysUntil } from './certificate.rules';

/** A player of the season with the expiry of their effective certificate (the furthest one), null without one. */
export interface DuePlayer {
  personId: string;
  name: string;
  surname: string | null;
  expiry: string | null;
}

export interface DueRow {
  personId: string;
  name: string;
  surname: string | null;
  status: 'expiring' | 'expired';
  expiry: string;
  /** Calendar days to the expiry: negative once expired. */
  daysLeft: number;
}

/**
 * Who a coach has to chase: players whose effective certificate expires within 30 days or has expired. Unlike the
 * notification, which stops counting a certificate expired for more than 30 days, an old expiry stays: that player
 * cannot play, and the list is where staff see it. Players with a valid certificate or none are left out. Most urgent
 * first, then by surname and name.
 */
export function dueRows(players: readonly DuePlayer[], today: string): DueRow[] {
  const rows: DueRow[] = [];
  for (const p of players) {
    if (!p.expiry) continue;
    const status = certificateStatus(p.expiry, today);
    if (status !== 'expiring' && status !== 'expired') continue;
    rows.push({ personId: p.personId, name: p.name, surname: p.surname, status, expiry: p.expiry, daysLeft: daysUntil(p.expiry, today) });
  }
  return rows.sort(
    (a, b) =>
      a.expiry.localeCompare(b.expiry) ||
      (a.surname ?? '').localeCompare(b.surname ?? '') ||
      a.name.localeCompare(b.name) ||
      a.personId.localeCompare(b.personId),
  );
}
