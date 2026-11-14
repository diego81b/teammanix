import { Entity, Property, Unique } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';

/** Optional grouping of teams of the club (for example a discipline or an age band). Sport and modules belong to the team. */
@Entity({ tableName: 'sections' })
@Unique({ properties: ['club', 'name'] })
export class Section extends TenantEntity {
  @Property({ length: 100 })
  name!: string;
}
