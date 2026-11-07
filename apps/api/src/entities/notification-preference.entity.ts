import { Entity, ManyToOne, Property, Unique, type Rel } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';
import { Club } from './club.entity';
import { User } from './user.entity';

/**
 * Athlete choice, per club and per channel: "I want to receive from A but not from B".
 * Belongs to the account and has no tenant filter, because the athlete manages them all from a single screen
 * while inside a single club. Queries filter user explicitly.
 *
 * If the row is missing, defaults apply: all channels active. Sending checks the row before creating
 * the Notification (inApp), before the mail (email) and before the push (push).
 * All notifications can be opted out of: none is required by law in the MVP.
 * The row is deleted when detaching from a club.
 */
@Entity({ tableName: 'notification_preferences' })
@Unique({ properties: ['user', 'club'] })
export class NotificationPreference extends BaseEntity {
  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: Rel<User>;

  @ManyToOne(() => Club, { index: true, deleteRule: 'cascade' })
  club!: Rel<Club>;

  @Property({ default: true })
  inApp: boolean = true;

  @Property({ default: true })
  email: boolean = true;

  @Property({ default: true })
  push: boolean = true;
}
