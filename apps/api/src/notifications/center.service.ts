import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { Notification } from '../entities/notification.entity';

export interface NotificationOut {
  id: string;
  type: string;
  params: Record<string, string | number>;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

/**
 * The notification center: what the logged in account received in the active club.
 * Every query filters by `a.userId` on top of the tenant filter: two members of the same club must never see or mark
 * each other's notifications.
 */
@Injectable()
export class CenterService {
  constructor(private readonly em: EntityManager) {}

  async list(a: AuthContext, limit: number = DEFAULT_LIMIT): Promise<{ items: NotificationOut[]; unread: number }> {
    const mine = { user: a.userId, inApp: true };
    const [rows, unread] = await Promise.all([
      this.em.find(Notification, mine, { orderBy: { createdAt: 'desc', id: 'desc' }, limit: Math.min(Math.max(limit, 1), MAX_LIMIT) }),
      this.em.count(Notification, { ...mine, readAt: null }),
    ]);
    return {
      items: rows.map((n) => ({ id: n.id, type: n.type, params: n.params, link: n.link, readAt: n.readAt, createdAt: n.createdAt })),
      unread,
    };
  }

  async markRead(a: AuthContext, id: string): Promise<void> {
    const n = await this.em.findOne(Notification, { id, user: a.userId, inApp: true });
    if (!n) throw new NotFoundException({ message: 'Notification not found', code: 'NOTIFICATION_NOT_FOUND' });
    if (n.readAt === null) {
      n.readAt = new Date();
      await this.em.flush();
    }
  }

  async markAllRead(a: AuthContext): Promise<void> {
    await this.em.nativeUpdate(Notification, { user: a.userId, inApp: true, readAt: null }, { readAt: new Date() });
  }
}
