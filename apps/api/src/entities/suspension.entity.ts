import { Check, Entity, Enum, ManyToOne, Property, type Rel } from '@mikro-orm/core';
import { Enrollment } from './enrollment.entity';
import { Event } from './event.entity';
import { SuspensionForm } from './enums';
import { TenantEntity } from './tenant.entity';

/**
 * Suspension of a player or a staff member from the matches of one team and season (rule 13). It never touches trainings.
 * Two forms: `period` (from `startDate` to `endDate`, every match, every competition) and `matches` (the next `matchCount`
 * matches from `startDate`, only in `competitions` when there are any). Served and remaining matches are not stored: they
 * are computed from the calendar, so a postponed or cancelled match fixes the count by itself. No free text.
 */
@Entity({ tableName: 'suspensions' })
@Check({
  name: 'suspensions_shape',
  expression: `((form = 'matches' and match_count >= 1 and end_date is null) or (form = 'period' and match_count is null and end_date is not null and end_date >= start_date and cardinality(competitions) = 0))`,
})
export class Suspension extends TenantEntity {
  @ManyToOne(() => Enrollment, { index: true, deleteRule: 'cascade' })
  enrollment!: Rel<Enrollment>;

  @Enum({ items: () => SuspensionForm, length: 20 })
  form!: SuspensionForm;

  /** Local day. Born from a match, the day of that match. */
  @Property({ type: 'date' })
  startDate!: string;

  /** `matches` form only. */
  @Property({ type: 'int', nullable: true })
  matchCount: number | null = null;

  /** `period` form only. */
  @Property({ type: 'date', nullable: true })
  endDate: string | null = null;

  /** `matches` form only. Names given to the events of the season; none means every competition. */
  @Property({ type: 'text[]', default: '{}' })
  competitions: string[] = [];

  /** The match the suspension was born from: the count starts from the next one. Null if created elsewhere or the match is gone. */
  @ManyToOne(() => Event, { nullable: true, deleteRule: 'set null' })
  originEvent: Rel<Event> | null = null;
}
