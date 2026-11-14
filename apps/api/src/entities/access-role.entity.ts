import { Check, Entity, Enum, ManyToOne, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { User } from './user.entity';
import { Section } from './section.entity';
import { Team } from './team.entity';
import { AccessRoleType, ScopeType } from './enums';
import { CHECK_ADMIN_CLUB, CHECK_SCOPE } from './scope';

/**
 * Admin and manager roles with scope. No expiry.
 * Staff and player are not here: they derive from the Enrollment in the season.
 * Duplicates (same user, role and scope) must be prevented in the service: uniqueness with null columns is not expressed in the DB.
 */
@Entity({ tableName: 'access_roles' })
@Check({ name: 'access_scope_consistent_roles', expression: CHECK_SCOPE })
@Check({ name: 'access_admin_roles_only_club', expression: CHECK_ADMIN_CLUB })
export class AccessRole extends TenantEntity {
  @ManyToOne(() => User, { index: true, deleteRule: 'cascade' })
  user!: Rel<User>;

  @Enum({ items: () => AccessRoleType, length: 20 })
  role!: AccessRoleType;

  @Enum({ items: () => ScopeType, length: 20 })
  scope!: ScopeType;

  @ManyToOne(() => Section, { nullable: true, deleteRule: 'no action' })
  section: Rel<Section> | null = null;

  @ManyToOne(() => Team, { nullable: true, deleteRule: 'cascade' })
  team: Rel<Team> | null = null;
}
