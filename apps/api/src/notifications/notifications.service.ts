import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { appConfig } from '../config/app.config';
import { Callup } from '../entities/callup.entity';
import { Club } from '../entities/club.entity';
import { EnrollmentType, NotificationType } from '../entities/enums';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { Notification } from '../entities/notification.entity';
import { Person } from '../entities/person.entity';
import { User } from '../entities/user.entity';
import { MailService } from '../mail/mail.service';
import { hasAnyChannel, isEligibleRecipient, openPath, openUrl, resolveChannels, type Channels } from './notification.rules';
import { notificationText } from './notification.texts';
import { PushService } from './push.service';

export interface NotifyInput {
  clubId: string;
  userIds: string[];
  type: NotificationType;
  /** Strings and numbers that fill the translated text. Never health data or free text: it shows on a lock screen. */
  params: Record<string, string | number>;
  /** Path inside the app the tap leads to. */
  link?: string | null;
  /** One notification per user and key, for jobs that run again (for example 'cert:<id>:30d'). */
  dedupKey?: string | null;
}

/** What a notification about an event needs from it. */
export interface EventRef {
  id: string;
  type: string;
  title: string | null;
  start: Date;
}

/** `count` is how many events the text is about: one here, more for a series change. */
export const eventParams = (club: string, event: EventRef): Record<string, string | number> => ({
  club,
  kind: event.type,
  title: event.title ?? '',
  start: event.start.toISOString(),
  count: 1,
});

interface Stored {
  notification: Notification;
  user: User;
  channels: Channels;
}

/**
 * Single entry point for every producer. It applies the rules of who receives what (disabled people, preferences,
 * type defaults), stores the notification and hands it to the delivery channels.
 *
 * A failure here is logged and never thrown: the action that caused the notification (a call-up, an edit) must not fail
 * because a notification could not be stored or sent.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly em: EntityManager,
    private readonly mail: MailService,
    private readonly push: PushService,
  ) {}

  /** @returns how many notifications were stored. */
  async notify(input: NotifyInput): Promise<number> {
    try {
      return await this.store(input);
    } catch (err) {
      this.logger.error(`notify ${input.type} failed: ${(err as Error).message}`);
      return 0;
    }
  }

  /** Notifies the given accounts about an event. Params: the club, the kind of event, its title and start (ISO instant). */
  async notifyEvent(clubId: string, event: EventRef, type: NotificationType, userIds: string[]): Promise<number> {
    try {
      if (userIds.length === 0) return 0;
      const club = await this.em.fork().findOneOrFail(Club, clubId, { fields: ['name'] });
      return await this.notify({ clubId, userIds, type, params: eventParams(club.name, event), link: `/events/${event.id}` });
    } catch (err) {
      this.logger.error(`notifyEvent ${type} failed: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * Tells the players called up for an event (call-up already sent, record active) that it changed or was cancelled.
   */
  async notifyCalledUp(clubId: string, event: EventRef, type: NotificationType): Promise<number> {
    try {
      const byUser = await this.calledUpUsers(clubId, [event.id]);
      return await this.notifyEvent(clubId, event, type, [...byUser.keys()]);
    } catch (err) {
      this.logger.error(`notifyCalledUp ${type} failed: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * One notification per player for several changed events of a series ("all future ones"), not one per event.
   * `count` is how many of the player's events changed; the link opens the calendar.
   */
  async notifyCalledUpSeries(clubId: string, title: string | null, eventIds: string[]): Promise<number> {
    try {
      const byUser = await this.calledUpUsers(clubId, eventIds);
      const club = await this.em.fork().findOneOrFail(Club, clubId, { fields: ['name'] });
      let created = 0;
      // Players with the same count share one call; the rest differ only in `count`.
      const groups = new Map<number, string[]>();
      for (const [userId, events] of byUser) groups.set(events.size, [...(groups.get(events.size) ?? []), userId]);
      for (const [count, userIds] of groups) {
        created += await this.notify({
          clubId,
          userIds,
          type: NotificationType.EVENT_MODIFIED,
          params: { club: club.name, kind: 'series', title: title ?? '', start: '', count },
          link: '/calendar',
        });
      }
      return created;
    } catch (err) {
      this.logger.error(`notifyCalledUpSeries failed: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * One notification per player for the sessions of a series that were removed, with the days they were on, not one per
   * session. `daysByUser`: for each account, the local day of each removed session the player was called up to. The link
   * opens the calendar, because the sessions are gone. Players with the same days share one call.
   */
  async notifyRemovedSeries(clubId: string, title: string | null, daysByUser: Map<string, string[]>): Promise<number> {
    try {
      if (daysByUser.size === 0) return 0;
      const club = await this.em.fork().findOneOrFail(Club, clubId, { fields: ['name'] });
      const groups = new Map<string, { count: number; days: string; userIds: string[] }>();
      for (const [userId, all] of daysByUser) {
        const days = [...new Set(all)].sort().join(',');
        const key = `${all.length}|${days}`;
        const group = groups.get(key) ?? { count: all.length, days, userIds: [] };
        group.userIds.push(userId);
        groups.set(key, group);
      }
      let created = 0;
      for (const { count, days, userIds } of groups.values()) {
        created += await this.notify({
          clubId,
          userIds,
          type: NotificationType.EVENT_CANCELLED,
          params: { club: club.name, kind: 'series', title: title ?? '', start: '', count, days },
          link: '/calendar',
        });
      }
      return created;
    } catch (err) {
      this.logger.error(`notifyRemovedSeries failed: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * The accounts of the players called up (sent) for the events, with the events each of them is called for. A removal reads
   * it before it deletes, because call-ups go with their events.
   */
  async calledUpUsers(clubId: string, eventIds: string[]): Promise<Map<string, Set<string>>> {
    if (eventIds.length === 0) return new Map();
    const rows = await this.em.fork().find(
      Callup,
      {
        club: clubId,
        event: { $in: eventIds },
        notifiedAt: { $ne: null },
        enrollment: { type: EnrollmentType.PLAYER, endedAt: null, person: { user: { $ne: null } } },
      },
      { filters: false, populate: ['enrollment.person.user'] },
    );
    const byUser = new Map<string, Set<string>>();
    for (const r of rows) {
      const userId = (r.enrollment.person.user as NonNullable<typeof r.enrollment.person.user>).id;
      byUser.set(userId, (byUser.get(userId) ?? new Set()).add(r.event.id));
    }
    return byUser;
  }

  private async store(input: NotifyInput): Promise<number> {
    const userIds = [...new Set(input.userIds)];
    if (userIds.length === 0) return 0;
    // Own fork: independent of the caller's unit of work, and usable by jobs that have no request.
    const em = this.em.fork();
    const [users, people, preferences, existing] = await Promise.all([
      em.find(User, { id: { $in: userIds } }),
      em.find(Person, { club: input.clubId, user: { $in: userIds } }, { filters: false }),
      em.find(NotificationPreference, { club: input.clubId, user: { $in: userIds } }),
      input.dedupKey
        ? em.find(Notification, { user: { $in: userIds }, dedupKey: input.dedupKey }, { filters: false, fields: ['user'] })
        : Promise.resolve([] as Notification[]),
    ]);
    const already = new Set(existing.map((n) => n.user.id));
    const preferenceOf = new Map(preferences.map((p) => [p.user.id, p]));

    const created: Stored[] = [];
    for (const user of users) {
      if (already.has(user.id)) continue;
      const mine = people.filter((p) => p.user?.id === user.id);
      if (!isEligibleRecipient({ deactivatedAt: user.deactivatedAt, people: mine })) continue;
      const channels = resolveChannels(input.type, preferenceOf.get(user.id) ?? null);
      if (!hasAnyChannel(channels)) continue;
      const notification = em.create(Notification, {
        club: input.clubId,
        user,
        type: input.type,
        params: input.params,
        link: input.link ?? null,
        dedupKey: input.dedupKey ?? null,
        inApp: channels.inApp,
        readAt: null,
        emailSentAt: null,
        pushSentAt: null,
      });
      created.push({ notification, user, channels });
    }
    await em.flush();
    await this.deliver(em, input.clubId, created);
    return created.length;
  }

  /**
   * Email and push go out after the notification is stored, one recipient at a time: a failure on one is logged and does
   * not stop the others, and never reaches the caller.
   */
  private async deliver(em: EntityManager, clubId: string, items: Stored[]): Promise<void> {
    for (const { notification, user, channels } of items) {
      try {
        const { title, body } = notificationText(notification.type, user.language, notification.params);
        if (channels.push) {
          // Shown on a lock screen: only what the text already says, the club in the title included.
          const payload = { title, body, url: openPath(clubId, notification.link), tag: notification.id };
          if (await this.push.deliver(em, user.id, payload)) notification.pushSentAt = new Date();
        }
        if (channels.email) {
          const link = openUrl(appConfig().appUrl, clubId, notification.link);
          if (await this.mail.send({ to: user.email, subject: title, text: `${body}

${link}` })) notification.emailSentAt = new Date();
        }
      } catch (err) {
        this.logger.error(`delivery of ${notification.type} failed: ${(err as Error).message}`);
      }
    }
    await em.flush();
  }
}
