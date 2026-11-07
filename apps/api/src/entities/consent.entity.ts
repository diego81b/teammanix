import { Entity, Enum, ManyToOne, Property, Unique, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { Person } from './person.entity';
import { ConsentStatus, ConsentType } from './enums';

/** One row per person and type. Changes go through audit, here only the current state remains. */
@Entity({ tableName: 'consents' })
@Unique({ properties: ['person', 'type'] })
export class Consent extends TenantEntity {
  @ManyToOne(() => Person, { deleteRule: 'cascade' })
  person!: Rel<Person>;

  @Enum({ items: () => ConsentType, length: 20 })
  type!: ConsentType;

  @Enum({ items: () => ConsentStatus, length: 20 })
  status!: ConsentStatus;

  @Property({ type: 'timestamptz' })
  data: Date = new Date();

  /** For minors, the guardian who gave consent. */
  @ManyToOne(() => Person, { nullable: true, deleteRule: 'set null' })
  grantedBy: Rel<Person> | null = null;
}
