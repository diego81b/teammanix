import { Entity, ManyToOne, Property, Unique, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { SportProfile } from './sport-profile.entity';

@Entity({ tableName: 'activities' })
@Unique({ properties: ['club', 'name'] })
export class Activity extends TenantEntity {
  @Property({ length: 100 })
  name!: string;

  @ManyToOne(() => SportProfile)
  sportProfile!: Rel<SportProfile>;

  /** Subset of sportProfile.modulesAvailable enabled by the club. */
  @Property({ type: 'json' })
  modulesActive: string[] = [];
}
