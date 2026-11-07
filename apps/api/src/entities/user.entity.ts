import { Entity, Enum, Property } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';
import { Language } from './enums';

/**
 * Global account of a natural person: classic login with email and password, session with JWT.
 * Does not belong to any club and has no tenant filter.
 *
 * Memberships are not a field: they derive from Person.user (player, staff) and from AccessRole
 * (admin, manager), each inside a club. The same account can have several.
 * The active club lives in the JWT and changes by issuing a new one.
 *
 * Email unique across the whole platform, stored lowercase by the service.
 */
@Entity({ tableName: 'users' })
export class User extends BaseEntity {
  @Property({ length: 320, unique: true })
  email!: string;

  /** Argon2 hash. */
  @Property({ length: 255, hidden: true })
  passwordHash!: string;

  @Property({ length: 100 })
  name!: string;

  @Property({ length: 100 })
  surname!: string;

  /** Language of the interface and of the emails received. Changed from the profile. */
  @Enum({ items: () => Language, length: 2, default: Language.IT })
  language: Language = Language.IT;

  @Property({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  deactivatedAt: Date | null = null;

  /**
   * Without refresh tokens or a session list, an already issued JWT is valid until expiry.
   * A password change sets this date, which acts as a version: tokens issued with a different value are rejected.
   */
  @Property({ type: 'timestamptz', nullable: true })
  tokenValidFrom: Date | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  lastAccessAt: Date | null = null;
}
