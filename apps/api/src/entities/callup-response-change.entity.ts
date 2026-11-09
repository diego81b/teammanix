import { Entity, Enum, Index, ManyToOne, Property, type Rel } from '@mikro-orm/core';
import { Enrollment } from './enrollment.entity';
import { CallupResponse, ReasonDecline } from './enums';
import { Event } from './event.entity';
import { TenantEntity } from './tenant.entity';
import { User } from './user.entity';

/**
 * One change of answer to an event, by a player (call-up) or a staff member (availability): who changed what and when.
 * `from` is `pending` for the first answer. It points to event and enrollment, not to the `Callup` row, so the trail
 * survives a removed and renewed call-up. Seen by staff, managers and the admin, never by players (the reason is personal).
 */
@Entity({ tableName: 'callup_response_changes' })
@Index({ properties: ['event', 'enrollment', 'createdAt'] })
export class CallupResponseChange extends TenantEntity {
  @ManyToOne(() => Event, { deleteRule: 'cascade' })
  event!: Rel<Event>;

  @ManyToOne(() => Enrollment, { deleteRule: 'cascade' })
  enrollment!: Rel<Enrollment>;

  @Enum({ items: () => CallupResponse, length: 20 })
  fromResponse!: CallupResponse;

  @Enum({ items: () => ReasonDecline, nullable: true, length: 30 })
  fromReason: ReasonDecline | null = null;

  @Enum({ items: () => CallupResponse, length: 20 })
  toResponse!: CallupResponse;

  @Enum({ items: () => ReasonDecline, nullable: true, length: 30 })
  toReason: ReasonDecline | null = null;

  /** The account that made the change. */
  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null' })
  changedBy: Rel<User> | null = null;

  /** When the change was made (same instant as `createdAt`, kept apart to read well in queries). */
  @Property({ type: 'timestamptz' })
  changedAt: Date = new Date();
}
