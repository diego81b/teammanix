import { EntityManager } from '@mikro-orm/postgresql';
import { EnrollmentType, SeasonStatus } from '../entities/enums';
import { ExpectedInjury } from '../entities/expected-injury.entity';
import { localDate } from '../events/event.rules';
import { type ExpectedPeriod, currentExpected } from './expected-injury.rules';

/** Periods of each person, from all their open player enrollments in seasons not closed. The caller filters by day. */
export async function expectedByPerson(em: EntityManager, personIds: readonly string[]): Promise<Map<string, ExpectedPeriod[]>> {
  const out = new Map<string, ExpectedPeriod[]>();
  if (!personIds.length) return out;
  const rows = await em.find(
    ExpectedInjury,
    { enrollment: { person: { $in: [...personIds] }, type: EnrollmentType.PLAYER, endedAt: null, season: { status: { $ne: SeasonStatus.CLOSED } } } },
    { populate: ['enrollment'] },
  );
  for (const r of rows) {
    const id = r.enrollment.person.id;
    out.set(id, [...(out.get(id) ?? []), { startDate: r.startDate, returnDate: r.returnDate }]);
  }
  return out;
}

/** The period still running for each person, today in the club's timezone. */
export async function currentByPerson(em: EntityManager, personIds: readonly string[]): Promise<Map<string, ExpectedPeriod | null>> {
  const today = localDate(new Date());
  const all = await expectedByPerson(em, personIds);
  return new Map(personIds.map((id) => [id, currentExpected(all.get(id) ?? [], today)]));
}

/** Confirming the injury consumes the periods of the person: back available later, no stale warning comes back. */
export async function consumeExpected(em: EntityManager, personId: string): Promise<string[]> {
  const rows = await em.find(ExpectedInjury, { enrollment: { person: personId } }, { populate: ['enrollment'] });
  for (const r of rows) em.remove(r);
  return rows.map((r) => r.enrollment.id);
}
