import { Check, Entity, Enum, Index, ManyToOne, Property, Unique, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { Season } from './season.entity';
import { Person } from './person.entity';
import { StaffRole } from './staff-role.entity';
import { EnrollmentStatus, EnrollmentType } from './enums';

/**
 * Person in a Season, as player or as staff. The staff or player role derives from here.
 *
 * Status is manual and has no clinical details. Eligibility is not a field: it is computed from
 * status, valid certificate and (phase 2) suspension. The callable and not callable lists are computed the same way.
 */
@Entity({ tableName: 'enrollments' })
@Unique({ properties: ['season', 'person', 'type'] })
@Index({ properties: ['person'] })
@Check({ expression: `(type = 'staff' or staff_role_id is null)` })
export class Enrollment extends TenantEntity {
  @ManyToOne(() => Season, { deleteRule: 'cascade' })
  season!: Rel<Season>;

  @ManyToOne(() => Person, { deleteRule: 'cascade' })
  person!: Rel<Person>;

  @Enum({ items: () => EnrollmentType, length: 20 })
  type!: EnrollmentType;

  /** Only for staff. The foreign key has no delete rule: a role in use is archived, and the service refuses to delete it. */
  @ManyToOne(() => StaffRole, { nullable: true, deleteRule: 'no action' })
  staffRole: Rel<StaffRole> | null = null;

  /** Optional label taken from SportProfile.positions. Structures nothing. */
  @Property({ length: 40, nullable: true })
  position: string | null = null;

  @Property({ type: 'int', nullable: true })
  jerseyNumber: number | null = null;

  @Enum({ items: () => EnrollmentStatus, length: 20 })
  status: EnrollmentStatus = EnrollmentStatus.AVAILABLE;

  /** Date on which the enrollment ends (promotion between teams, transfer). null = still open. */
  @Property({ type: 'date', nullable: true })
  endedAt: string | null = null;
}
