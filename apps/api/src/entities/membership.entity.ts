import { Entity, ManyToOne, Property, Unique, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { User } from './user.entity';
import type { DiffPolicy } from '../permissions/policy';

/**
 * Policy of an account in a club (ANALISI rule 14): only the differences from the role model,
 * `true` grants and `false` revokes. One row per user and club, valid for all roles the account has there.
 * Without a row the defaults apply. Deleted at detachment and when the account is left with no roles or record.
 */
@Entity({ tableName: 'memberships' })
@Unique({ properties: ['club', 'user'] })
export class Membership extends TenantEntity {
  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: Rel<User>;

  @Property({ type: 'json' })
  diff: DiffPolicy = {};
}
