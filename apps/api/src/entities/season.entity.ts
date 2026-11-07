import { Check, Entity, Enum, Index, ManyToOne, Property, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { Team } from './team.entity';
import { SeasonStatus } from './enums';

/** What happens in a team in a period, including members (Enrollment). One active season and one draft per team. */
@Entity({ tableName: 'seasons' })
@Index({ properties: ['team', 'startDate'] })
@Index({
  name: 'seasons_one_draft_per_team_uq',
  expression:
    `create unique index "seasons_one_draft_per_team_uq" on "seasons" ("team_id") where "status" = 'draft'`,
})
@Index({
  name: 'seasons_one_active_per_team_uq',
  expression:
    `create unique index "seasons_one_active_per_team_uq" on "seasons" ("team_id") where "status" = 'active'`,
})
@Check({ expression: 'end_date >= start_date' })
export class Season extends TenantEntity {
  @ManyToOne(() => Team, { deleteRule: 'cascade' })
  team!: Rel<Team>;

  /** For example '2026/27'. */
  @Property({ length: 60 })
  name!: string;

  @Property({ type: 'date' })
  startDate!: string;

  @Property({ type: 'date' })
  endDate!: string;

  /** A closed season is read-only (rule 7). */
  @Enum({ items: () => SeasonStatus, length: 20 })
  status: SeasonStatus = SeasonStatus.DRAFT;

  @Property({ length: 150, nullable: true })
  league: string | null = null;
}
