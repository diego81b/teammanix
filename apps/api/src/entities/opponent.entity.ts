import { Entity, ManyToOne, Property, Unique, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { Activity } from './activity.entity';

@Entity({ tableName: 'opponents' })
@Unique({ properties: ['activity', 'name'] })
export class Opponent extends TenantEntity {
  @ManyToOne(() => Activity, { deleteRule: 'cascade' })
  activity!: Rel<Activity>;

  @Property({ length: 150 })
  name!: string;
}
