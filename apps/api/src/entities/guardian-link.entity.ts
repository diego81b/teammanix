import { Check, Entity, Enum, ManyToOne, Unique, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { Person } from './person.entity';
import { GuardianRelation } from './enums';

@Entity({ tableName: 'guardian_links' })
@Unique({ properties: ['minor', 'guardian'] })
@Check({ expression: 'minor_id <> guardian_id' })
export class GuardianLink extends TenantEntity {
  @ManyToOne(() => Person, { index: true, deleteRule: 'cascade' })
  minor!: Rel<Person>;

  @ManyToOne(() => Person, { index: true, deleteRule: 'cascade' })
  guardian!: Rel<Person>;

  @Enum({ items: () => GuardianRelation, length: 20 })
  relation!: GuardianRelation;
}
