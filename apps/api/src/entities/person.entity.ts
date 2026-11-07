import { Check, Entity, Index, ManyToOne, Property, Unique, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { User } from './user.entity';

/**
 * Single record per club, minimal data. No sex, no tax code, no physical measurements.
 * A single row even if the person is a player, staff or both, in one or more teams.
 *
 * Login is a different matter: the athlete may have no account. If they do, the link lives here (user),
 * never on the account. The account is global, so the same User can be linked to a Person
 * in each of its clubs, and the link cannot cross clubs by construction.
 *
 * Creation: whoever invites enters only name and email ("to complete" record). Surname, birth date and
 * phone are entered by the person on acceptance; `completedAt` is set at that point.
 *
 * Detachment: the athlete (or the admin) sets user to null. The record and data stay with the club, which
 * owns them, but the account no longer sees them.
 */
@Entity({ tableName: 'people' })
@Index({ properties: ['club', 'surname', 'name'] })
@Unique({ properties: ['club', 'user'] })
@Check({ expression: '(email is not null or phone is not null)' })
@Check({
  name: 'people_complete_consistent',
  expression: '(completed_at is null or (surname is not null and birth_date is not null))',
})
export class Person extends TenantEntity<'surname' | 'birthDate' | 'completedAt' | 'disabledAt'> {
  @Property({ length: 100 })
  name!: string;

  /** Null until the record is completed by the person. */
  @Property({ length: 100, nullable: true })
  surname: string | null = null;

  /** YYYY-MM-DD string. Used to recognize minors. Null until the record is completed. */
  @Property({ type: 'date', nullable: true })
  birthDate: string | null = null;

  /** When the person completed the record. Null = record "to complete". */
  @Property({ type: 'timestamptz', nullable: true })
  completedAt: Date | null = null;

  @Property({ length: 320, nullable: true })
  email: string | null = null;

  @Property({ length: 30, nullable: true })
  phone: string | null = null;

  @Property({ type: 'text', nullable: true })
  photoUrl: string | null = null;

  /**
   * Disabling (rule 12): applies to the whole club. The record stays, the history stays, but the person disappears from lists,
   * is not callable and their account loses access to the club. Null = active.
   */
  @Property({ type: 'timestamptz', nullable: true })
  disabledAt: Date | null = null;

  /** Account that signs in as this person. null = no app access. Unique per club, not global. */
  @ManyToOne(() => User, { nullable: true, index: true, deleteRule: 'set null' })
  user: Rel<User> | null = null;
}
