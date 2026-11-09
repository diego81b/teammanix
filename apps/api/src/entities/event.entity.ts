import { Check, Entity, Enum, Index, ManyToOne, Property, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { Season } from './season.entity';
import { EventSeries } from './event-series.entity';
import { Venue } from './venue.entity';
import { Opponent } from './opponent.entity';
import { HomeAway, EventStatus, EventType } from './enums';

/**
 * Training, match or other. Match fields are null for other types.
 * The result is a generic score (own, opponent): it applies to every sport. Individual sports leave it empty.
 */
@Entity({ tableName: 'events' })
@Index({ properties: ['season', 'start'] })
@Index({ properties: ['club', 'start'] })
@Index({
  name: 'events_series_occurrence_uq',
  expression: `create unique index "events_series_occurrence_uq" on "events" ("series_id", "occurrence_date") where "series_id" is not null`,
})
@Check({ name: 'events_end_after_start', expression: '"end" > "start"' })
@Check({
  name: 'events_fields_only_match',
  expression: `(type = 'match' or (opponent_id is null and home_away is null and own_score is null and opponent_score is null))`,
})
export class Event extends TenantEntity {
  @ManyToOne(() => Season, { deleteRule: 'cascade' })
  season!: Rel<Season>;

  @ManyToOne(() => EventSeries, { nullable: true, index: true, deleteRule: 'set null' })
  series: Rel<EventSeries> | null = null;

  /**
   * Local day of the series slot this event fills. Set when the event is generated and never changed by a manual edit,
   * so a session moved by hand or cancelled still holds its slot and regeneration does not create it twice.
   */
  @Property({ type: 'date', nullable: true })
  occurrenceDate: string | null = null;

  /** true if an event of a series was edited by hand and regeneration must not touch it. */
  @Property({ default: false })
  exception: boolean = false;

  @Enum({ items: () => EventType, length: 20 })
  type!: EventType;

  @Property({ length: 150, nullable: true })
  title: string | null = null;

  @Property({ type: 'timestamptz' })
  start!: Date;

  @Property({ type: 'timestamptz' })
  end!: Date;

  @ManyToOne(() => Venue, { nullable: true, deleteRule: 'set null' })
  venue: Rel<Venue> | null = null;

  /** Staff notes, visible to called-up players. Never health data. */
  @Property({ type: 'text', nullable: true })
  note: string | null = null;

  @Enum({ items: () => EventStatus, length: 20 })
  status: EventStatus = EventStatus.SCHEDULED;

  @ManyToOne(() => Opponent, { nullable: true, deleteRule: 'set null' })
  opponent: Rel<Opponent> | null = null;

  @Enum({ items: () => HomeAway, nullable: true, length: 20 })
  homeAway: HomeAway | null = null;

  @Property({ length: 150, nullable: true })
  competition: string | null = null;

  @Property({ type: 'int', nullable: true })
  ownScore: number | null = null;

  @Property({ type: 'int', nullable: true })
  opponentScore: number | null = null;
}
