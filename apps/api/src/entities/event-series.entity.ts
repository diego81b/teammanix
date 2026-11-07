import { Entity, Enum, ManyToOne, Property, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { Season } from './season.entity';
import { Venue } from './venue.entity';
import { EventType } from './enums';

/**
 * Recurrence of trainings (or other events). Events are generated as real rows for the whole season
 * (or up to `untilTo`), so callups and attendance stay per event. Each generated Event
 * keeps the reference to the series. If a single event is edited, `exception` is set on it.
 */
@Entity({ tableName: 'event_series' })
export class EventSeries extends TenantEntity {
  @ManyToOne(() => Season, { index: true, deleteRule: 'cascade' })
  season!: Rel<Season>;

  @Enum({ items: () => EventType, length: 20 })
  type!: EventType;

  @Property({ length: 150, nullable: true })
  title: string | null = null;

  /** RRULE rule (RFC 5545), for example 'FREQ=WEEKLY;BYDAY=TU,TH'. */
  @Property({ length: 300 })
  rule!: string;

  /** First day of the series, YYYY-MM-DD. */
  @Property({ type: 'date' })
  startDate!: string;

  /** Last day of the series. null = until end of season. */
  @Property({ type: 'date', nullable: true })
  untilTo: string | null = null;

  /** Local start time, HH:mm. The UTC instant is computed with the timezone at each generation, so daylight saving does not shift events. */
  @Property({ length: 5 })
  timeStart!: string;

  @Property({ type: 'int' })
  durationMinutes!: number;

  @Property({ length: 60, default: 'Europe/Rome' })
  timezone: string = 'Europe/Rome';

  @ManyToOne(() => Venue, { nullable: true, deleteRule: 'set null' })
  venue: Rel<Venue> | null = null;
}
