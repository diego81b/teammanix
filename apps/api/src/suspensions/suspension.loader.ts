import { EntityManager } from '@mikro-orm/postgresql';
import { EventType } from '../entities/enums';
import { Event } from '../entities/event.entity';
import { Suspension } from '../entities/suspension.entity';
import { blockFor, type Block, type MatchInfo, type SuspensionData } from './suspension.rules';

/** The matches of a season, as the rules read them. Trainings and other events never take part in the count. */
export async function loadMatches(em: EntityManager, seasonId: string): Promise<MatchInfo[]> {
  const rows = await em.find(Event, { season: seasonId, type: EventType.MATCH }, { fields: ['id', 'start', 'status', 'competition'] });
  return rows.map((e) => ({ id: e.id, start: e.start, status: e.status, competition: e.competition }));
}

/** The data the rules need from a stored suspension. The origin event must be populated or loaded as a reference with its start. */
export const suspensionData = (s: Suspension): SuspensionData => ({
  form: s.form,
  startDate: s.startDate,
  matchCount: s.matchCount,
  endDate: s.endDate,
  competitions: s.competitions,
  originStart: s.originEvent?.start ?? null,
});

/** The suspensions of the enrollments, grouped by enrollment, with the origin event loaded. */
export async function loadSuspensions(em: EntityManager, enrollmentIds: readonly string[]): Promise<Map<string, Suspension[]>> {
  const out = new Map<string, Suspension[]>();
  if (enrollmentIds.length === 0) return out;
  const rows = await em.find(Suspension, { enrollment: { $in: [...enrollmentIds] } }, { populate: ['originEvent'], orderBy: { startDate: 'asc', createdAt: 'asc' } });
  for (const r of rows) out.set(r.enrollment.id, [...(out.get(r.enrollment.id) ?? []), r]);
  return out;
}

/** Why the enrollment cannot play this match, or null. `matches` are the matches of the season of the event. */
export function suspensionBlock(suspensions: readonly Suspension[] | undefined, matches: readonly MatchInfo[], eventId: string, now = new Date()): Block | null {
  return suspensions?.length ? blockFor(suspensions.map(suspensionData), matches, eventId, now) : null;
}
