import { Entity, Property, Unique } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';

@Entity({ tableName: 'venues' })
@Unique({ properties: ['club', 'name'] })
export class Venue extends TenantEntity {
  @Property({ length: 150 })
  name!: string;

  @Property({ length: 300, nullable: true })
  address: string | null = null;
}
