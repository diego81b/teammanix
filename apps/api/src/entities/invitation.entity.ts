import { Check, Entity, Enum, Index, ManyToOne, Property, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { User } from './user.entity';
import { Person } from './person.entity';
import { Activity } from './activity.entity';
import { Team } from './team.entity';
import { Language, InvitationRole, InvitationStatus, ScopeType } from './enums';
import { CHECK_ADMIN_CLUB, CHECK_SCOPE } from './scope';

/**
 * For staff and player roles the scope indicates the destination team and person is the record
 * to link the account to on acceptance. The Enrollment is created from team management, not from the invitation.
 */
@Entity({ tableName: 'invitations' })
@Index({ properties: ['club', 'email'] })
@Check({ name: 'invitations_scope_consistent', expression: CHECK_SCOPE })
@Check({ name: 'invitations_admin_only_club', expression: CHECK_ADMIN_CLUB })
export class Invitation extends TenantEntity<'status'> {
  @Property({ length: 320 })
  email!: string;

  @Enum({ items: () => InvitationRole, length: 20 })
  role!: InvitationRole;

  @Enum({ items: () => ScopeType, length: 20 })
  scope!: ScopeType;

  @ManyToOne(() => Activity, { nullable: true, deleteRule: 'cascade' })
  activity: Rel<Activity> | null = null;

  @ManyToOne(() => Team, { nullable: true, deleteRule: 'cascade' })
  team: Rel<Team> | null = null;

  @ManyToOne(() => Person, { nullable: true, deleteRule: 'set null' })
  person: Rel<Person> | null = null;

  /** SHA-256 hash of the token sent by email. The plain token is not stored. */
  @Property({ length: 64, unique: true, hidden: true })
  tokenHash!: string;

  /** Language of the email and of the invitation page: chosen by the inviter, the recipient may not have an account yet. */
  @Enum({ items: () => Language, length: 2, default: Language.IT })
  language: Language = Language.IT;

  @Property({ type: 'timestamptz' })
  expiresAt!: Date;

  @Enum({ items: () => InvitationStatus, length: 20 })
  status: InvitationStatus = InvitationStatus.SENT;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  invitedBy!: Rel<User>;

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null' })
  acceptedBy: Rel<User> | null = null;
}
