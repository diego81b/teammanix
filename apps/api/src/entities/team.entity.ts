import { Entity, Enum, Index, ManyToOne, Property, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { Section } from './section.entity';
import { SportProfile } from './sport-profile.entity';
import { TeamGender } from './enums';

/** Persistent identity of the team. What happens in a period lives in the Season. */
@Entity({ tableName: 'teams' })
@Index({
  name: 'teams_club_section_name_uq',
  // Two teams without a section cannot share a name: NULLS NOT DISTINCT makes the null section count as a value.
  expression: `create unique index "teams_club_section_name_uq" on "teams" ("club_id", "section_id", "name") nulls not distinct`,
})
export class Team extends TenantEntity {
  /** Optional grouping. Deleting a section moves its teams out of it, it never deletes them. */
  @ManyToOne(() => Section, { nullable: true, index: true, deleteRule: 'set null' })
  section: Rel<Section> | null = null;

  @Property({ length: 100 })
  name!: string;

  /** Sport rules of the team: positions, starters and bench, modules. Fixed at creation. */
  @ManyToOne(() => SportProfile)
  sportProfile!: Rel<SportProfile>;

  /** Subset of sportProfile.modulesAvailable enabled for this team. */
  @Property({ type: 'json' })
  modulesActive: string[] = [];

  @Property({ length: 60, nullable: true })
  category: string | null = null;

  /** Gender lives on the team, not on the person. */
  @Enum({ items: () => TeamGender, nullable: true, length: 20 })
  gender: TeamGender | null = null;

  @Property({ type: 'text', nullable: true })
  logoUrl: string | null = null;
}
