import { Entity, ManyToOne, Property, type Rel } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

/**
 * Web Push subscription (VAPID), one per device. Belongs to the account, not to a club:
 * the browser has a single endpoint per site. Which clubs may send push is decided by NotificationPreference.
 * On iOS it requires the installed PWA (16.4+).
 */
@Entity({ tableName: 'push_subscriptions' })
export class PushSubscription extends BaseEntity {
  @ManyToOne(() => User, { index: true, deleteRule: 'cascade' })
  user!: Rel<User>;

  @Property({ type: 'text', unique: true })
  endpoint!: string;

  @Property({ length: 200, hidden: true })
  p256dh!: string;

  @Property({ length: 100, hidden: true })
  auth!: string;

  @Property({ length: 300, nullable: true })
  userAgent: string | null = null;

  /** Last delivery error (404/410 = to be deleted). */
  @Property({ type: 'timestamptz', nullable: true })
  lastErrorAt: Date | null = null;
}
