import { Entity, ManyToOne, Property, Unique, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { Team } from './team.entity';

/** Rival of one team: a rival met by two teams of the club exists once for each. */
@Entity({ tableName: 'opponents' })
@Unique({ properties: ['team', 'name'] })
export class Opponent extends TenantEntity {
  @ManyToOne(() => Team, { deleteRule: 'cascade' })
  team!: Rel<Team>;

  @Property({ length: 150 })
  name!: string;
}
