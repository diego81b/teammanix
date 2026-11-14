import { Entity, Enum, Property, Unique } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { StaffPolicyModel } from './enums';

/**
 * Role of the club's staff (coach, master, instructor, ...). The club owns the catalog; the permission model
 * only picks one of the templates of rule 14. An archived role stays on the enrollments that have it.
 */
@Entity({ tableName: 'staff_roles' })
@Unique({ properties: ['club', 'nameKey'] })
export class StaffRole extends TenantEntity<'mustBeAvailable' | 'archivedAt'> {
  @Property({ length: 60 })
  name!: string;

  /** `nameKey(name)`: makes the name unique within the club ignoring case and accents. Written with the name. */
  @Property({ length: 60 })
  nameKey!: string;

  @Enum({ items: () => StaffPolicyModel, length: 20 })
  policyModel!: StaffPolicyModel;

  /** Counts for the event warning "nobody required has declared available". */
  @Property({ default: false })
  mustBeAvailable: boolean = false;

  @Property({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null = null;
}
