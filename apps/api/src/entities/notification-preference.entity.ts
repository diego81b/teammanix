import { Entity, ManyToOne, Property, Unique, type Rel } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';
import { Club } from './club.entity';
import { User } from './user.entity';

/**
 * Athlete choice, per club and per channel: "I want to receive from A but not from B".
 * Belongs to the account and has no tenant filter, because the athlete manages them all from a single screen
 * while inside a single club. Queries filter user explicitly.
 *
 * If the row is missing, defaults apply: all channels active. `NotificationsService` combines the row with what the
 * type sends by default (`resolveChannels`): nothing is stored when every channel is off, and with in-app off but email
 * or push on the Notification is stored with `inApp = false`, hidden from the center.
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
