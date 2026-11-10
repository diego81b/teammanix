import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { PushSubscription } from '../entities/push-subscription.entity';
import { User } from '../entities/user.entity';
import type { SubscriptionDto } from './dto';
import { pushConfigured, WebPushSender, type PushSender } from './push.sender';

const notConfigured = () => new NotFoundException({ message: 'Push notifications are not configured', code: 'PUSH_NOT_CONFIGURED' });

/**
 * Devices of an account and delivery to them. A device belongs to the account, not to a club: the browser has one endpoint
 * per site, and which clubs may push is the preference of each club.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger('Push');
  /** Replaceable: tests use a fake, so no test reaches a real push service. */
  sender: PushSender = new WebPushSender();

  constructor(private readonly em: EntityManager) {}

  /** The VAPID variables are read on every call, like the other configuration. */
  publicKey(): { publicKey: string } {
    if (!pushConfigured()) throw notConfigured();
    return { publicKey: process.env.VAPID_PUBLIC_KEY as string };
  }

  /** One row per endpoint. A device that signs in with another account moves to it. */
  async subscribe(a: AuthContext, dto: SubscriptionDto, userAgent: string | null): Promise<void> {
    if (!pushConfigured()) throw notConfigured();
    const em = this.em.fork();
    const user = em.getReference(User, a.userId);
    const row = await em.findOne(PushSubscription, { endpoint: dto.endpoint });
    if (row) {
      row.user = user;
      row.p256dh = dto.keys.p256dh;
      row.auth = dto.keys.auth;
      row.userAgent = userAgent;
      row.lastErrorAt = null;
    } else {
      em.create(PushSubscription, { user, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth, userAgent, lastErrorAt: null });
    }
    await em.flush();
  }

  /** Only the caller's own device. Silent otherwise, so an endpoint cannot be probed. */
  async unsubscribe(a: AuthContext, endpoint: string): Promise<void> {
    await this.em.fork().nativeDelete(PushSubscription, { endpoint, user: a.userId });
  }

  /**
   * Sends to every device of the account. A subscription the push service reports as gone is deleted; another failure is
   * recorded and the device kept.
   * @returns true if at least one device accepted it.
   */
  async deliver(em: EntityManager, userId: string, payload: object): Promise<boolean> {
    if (!pushConfigured()) return false;
    const devices = await em.find(PushSubscription, { user: userId });
    const body = JSON.stringify(payload);
    let delivered = false;
    for (const d of devices) {
      try {
        const result = await this.sender.send({ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth }, body);
        if (result === 'ok') delivered = true;
        else if (result === 'gone') em.remove(d);
        else d.lastErrorAt = new Date();
      } catch (err) {
        this.logger.error(`push to a device failed: ${(err as Error).message}`);
        d.lastErrorAt = new Date();
      }
    }
    await em.flush();
    return delivered;
  }
}
