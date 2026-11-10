import { Entity, Enum, Index, ManyToOne, Property, Unique, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { User } from './user.entity';
import { NotificationType } from './enums';

/**
 * Notification stored by `NotificationsService`. In-app, email and push all start from the same row, respecting NotificationPreference.
 *
 * It stores no rendered text: it stores `type` and `params`. The frontend translates into the user's current language
 * (key `notifications.<type>.title` and `.body`), so a language change also translates the history.
 * Email and push leave the app: the server renders them in the recipient's `User.language`, from the same type and params pair.
 * Params include the club name, because the same device receives from several clubs.
 * Never health data in params: the text appears on the phone's lock screen.
 */
@Entity({ tableName: 'notifications' })
@Index({ properties: ['user', 'readAt', 'createdAt'] })
@Unique({ properties: ['user', 'dedupKey'] })
export class Notification extends TenantEntity<'inApp'> {
  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: Rel<User>;

  @Enum({ items: () => NotificationType, length: 30 })
  type!: NotificationType;

  /**
   * Whether the notification center shows it. False when the person turned in-app off but kept email or push:
   * the row still exists, because both deliver from it.
   */
  @Property({ default: true })
  inApp: boolean = true;

  /** Values that fill the translated text, for example { club, event, date }. Strings and numbers only. */
  @Property({ type: 'json' })
  params: Record<string, string | number> = {};

  /** Path inside the app the tap leads to, for example '/events/<id>'. */
  @Property({ length: 300, nullable: true })
  link: string | null = null;

  /**
   * Avoids duplicates in periodic jobs, for example 'cert:<certificateId>:30d'.
   * null values do not collide with each other in the uniqueness, so notifications without a key stay free.
   */
  @Property({ length: 120, nullable: true })
  dedupKey: string | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  readAt: Date | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  emailSentAt: Date | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  pushSentAt: Date | null = null;
}
