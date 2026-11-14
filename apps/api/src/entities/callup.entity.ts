import { Check, Entity, Enum, ManyToOne, Property, Unique, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { Event } from './event.entity';
import { Enrollment } from './enrollment.entity';
import { Placement, ReasonDecline, CallupResponse } from './enums';

/**
 * A row exists only for called-up players. The "callable" and "not callable" lists are not stored:
 * they are computed from Enrollment (status, certificate, suspension) and from the absence of a Callup for the event.
 *
 * The service must verify that enrollment.season = event.season and that the enrollment is of player type.
 */
@Entity({ tableName: 'callups' })
@Unique({ properties: ['event', 'enrollment'] })
@Check({ expression: `(reason is null or response = 'declined')` })
export class Callup extends TenantEntity {
  @ManyToOne(() => Event, { deleteRule: 'cascade' })
  event!: Rel<Event>;

  @ManyToOne(() => Enrollment, { index: true, deleteRule: 'cascade' })
  enrollment!: Rel<Enrollment>;

  @Enum({ items: () => CallupResponse, length: 20 })
  response: CallupResponse = CallupResponse.PENDING;

  /** Closed list. Only with a declined response. No free text. */
  @Enum({ items: () => ReasonDecline, nullable: true, length: 30 })
  reason: ReasonDecline | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  responseAt: Date | null = null;

  /** null = notification not yet sent. "Send callup" notifies only rows with null. */
  @Property({ type: 'timestamptz', nullable: true })
  notifiedAt: Date | null = null;

  /**
   * Starter or bench. Can be set only if the team's SportProfile has starterBench = true.
   * Never exposed to the player: must be excluded from serialization for the player role.
   */
  @Enum({ items: () => Placement, nullable: true, length: 20 })
  placement: Placement | null = null;
}
