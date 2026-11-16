export interface AdminRow {
  clubId: string;
  userId: string;
}

/**
 * Clubs the account could not leave without losing every admin. `rows` are all the admin rows (club scope)
 * of the clubs where the account is an admin; a club with another admin is not listed.
 */
export function clubsWhereSoleAdmin(rows: AdminRow[], userId: string): string[] {
  const byClub = new Map<string, Set<string>>();
  for (const r of rows) {
    const admins = byClub.get(r.clubId) ?? new Set<string>();
    admins.add(r.userId);
    byClub.set(r.clubId, admins);
  }
  return [...byClub].filter(([, admins]) => admins.has(userId) && admins.size === 1).map(([clubId]) => clubId);
}
