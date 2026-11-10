import { Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { isPushEndpoint } from './push-endpoint.rules';

export type PushResult = 'ok' | 'gone' | 'error';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** One transport per device. Behind an interface so tests use a fake and never reach a push service. */
export interface PushSender {
  send(target: PushTarget, payload: string): Promise<PushResult>;
}

/** 404 and 410: the browser dropped the subscription, so it is deleted. Anything else may pass: it is kept. */
export const classifyPushStatus = (status: number | undefined): 'gone' | 'error' => (status === 404 || status === 410 ? 'gone' : 'error');

/** True when the VAPID keys are set. Without them push is off: the app works and the button is not offered. */
export const pushConfigured = (env: NodeJS.ProcessEnv = process.env): boolean => !!env.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY;

/** Web Push with VAPID. Keys and contact in `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` or `https:`). */
export class WebPushSender implements PushSender {
  private readonly logger = new Logger('Push');

  async send(target: PushTarget, payload: string): Promise<PushResult> {
    // Checked again here: a row stored before the allowlist must not make the server call an arbitrary address. It is dropped.
    if (!isPushEndpoint(target.endpoint)) return 'gone';
    try {
      await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, {
        vapidDetails: {
          subject: process.env.VAPID_SUBJECT || 'mailto:noreply@teammanix.local',
          publicKey: process.env.VAPID_PUBLIC_KEY as string,
          privateKey: process.env.VAPID_PRIVATE_KEY as string,
        },
        TTL: 24 * 3600,
      });
      return 'ok';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      this.logger.warn(`push failed (${status ?? 'no status'}): ${(err as Error).message}`);
      return classifyPushStatus(status);
    }
  }
}
