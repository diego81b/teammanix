import { Entity, Enum, ManyToOne, Property, Unique, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { Event } from './event.entity';
import { Enrollment } from './enrollment.entity';
import { User } from './user.entity';
import { AttendanceOutcome } from './enums';

/** No free note: prevents health data from entering. Online recording only. */
@Entity({ tableName: 'attendances' })
@Unique({ properties: ['event', 'enrollment'] })
export class Attendance extends TenantEntity {
  @ManyToOne(() => Event, { deleteRule: 'cascade' })
  event!: Rel<Event>;

  @ManyToOne(() => Enrollment, { index: true, deleteRule: 'cascade' })
  enrollment!: Rel<Enrollment>;

  @Enum({ items: () => AttendanceOutcome, length: 30 })
  outcome!: AttendanceOutcome;

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null' })
  registeredBy: Rel<User> | null = null;

  @Property({ type: 'timestamptz' })
  registeredAt: Date = new Date();
}
