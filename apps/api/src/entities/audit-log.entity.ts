import { Entity, Enum, Index, ManyToOne, Property, type Rel } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';
import { Club } from './club.entity';
import { User } from './user.entity';
import { AuditAction } from './enums';

/**
 * Traces accesses, roles and accesses to health data. Append only.
 * club and user are nullable (for example failed login, registration) and the tenant filter does not apply:
 * reading for the admin filters club explicitly. FKs use set null, so the log survives
 * the deletion of a person or an account.
 */
@Entity({ tableName: 'audit_log' })
@Index({ properties: ['club', 'createdAt'] })
@Index({ properties: ['entity', 'entityId'] })
export class AuditLog extends BaseEntity {
  @ManyToOne(() => Club, { nullable: true, deleteRule: 'set null' })
  club: Rel<Club> | null = null;

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null' })
  user: Rel<User> | null = null;

  @Enum({ items: () => AuditAction, length: 40 })
  action!: AuditAction;

  @Property({ length: 60, nullable: true })
  entity: string | null = null;

  @Property({ type: 'uuid', nullable: true })
  entityId: string | null = null;

  /** Non-sensitive technical details (never health data or passwords). */
  @Property({ type: 'json', nullable: true })
  meta: Record<string, unknown> | null = null;
}
