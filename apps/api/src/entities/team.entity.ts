import { Entity, Enum, ManyToOne, Property, Unique, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { Activity } from './activity.entity';
import { TeamGender } from './enums';

/** Persistent identity of the team. What happens in a period lives in the Season. */
@Entity({ tableName: 'teams' })
@Unique({ properties: ['activity', 'name'] })
export class Team extends TenantEntity {
  @ManyToOne(() => Activity, { index: true, deleteRule: 'cascade' })
  activity!: Rel<Activity>;

  @Property({ length: 100 })
  name!: string;

  @Property({ length: 60, nullable: true })
  category: string | null = null;

  /** Gender lives on the team, not on the person. */
  @Enum({ items: () => TeamGender, nullable: true, length: 20 })
  gender: TeamGender | null = null;

  @Property({ type: 'text', nullable: true })
  logoUrl: string | null = null;
}
