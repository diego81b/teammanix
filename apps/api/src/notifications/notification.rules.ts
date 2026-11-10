import { NotificationType } from '../entities/enums';

/** Pure rules for notifications. No DB, no Nest: the service applies them. */

export interface Channels {
  inApp: boolean;
  email: boolean;
  push: boolean;
}

const ALL: Channels = { inApp: true, email: true, push: true };
const QUIET: Channels = { inApp: true, email: false, push: true };

/**
 * What each type sends. A change to an event or a declared absence is frequent and low stakes: in app and push, no email.
 * Everything that asks the person to act or protects their eligibility also goes by email.
 * `Record<NotificationType, ...>` fails to compile when a type is added without a default.
 */
export const DEFAULT_CHANNELS: Record<NotificationType, Channels> = {
  [NotificationType.CALLUP]: ALL,
  [NotificationType.EVENT_MODIFIED]: QUIET,
  [NotificationType.EVENT_CANCELLED]: ALL,
  [NotificationType.CERTIFICATE_EXPIRING]: ALL,
  [NotificationType.CERTIFICATE_EXPIRED]: ALL,
  [NotificationType.CERTIFICATES_DUE]: ALL,
  [NotificationType.ABSENCE_DECLARED]: QUIET,
};

/**
 * The channels to use: those the type sends by default and the person did not turn off.
 * Without a stored preference every channel is on (ANALISI rule 6).
 */
export function resolveChannels(type: NotificationType, preference: Channels | null): Channels {
  const base = DEFAULT_CHANNELS[type];
  const choice = preference ?? ALL;
  return { inApp: base.inApp && choice.inApp, email: base.email && choice.email, push: base.push && choice.push };
}

export const hasAnyChannel = (c: Channels): boolean => c.inApp || c.email || c.push;

export interface RecipientFacts {
  deactivatedAt: Date | null;
  /** The account's records in the club. At most one by construction, none for an admin without a record. */
  people: { disabledAt: Date | null }[];
}

/** A deactivated account and a disabled person receive nothing (rule 12). */
export const isEligibleRecipient = (r: RecipientFacts): boolean => r.deactivatedAt === null && r.people.every((p) => p.disabledAt === null);

export interface EventFacts {
  type: string;
  start: Date;
  end: Date;
  venueId: string | null;
  opponentId: string | null;
  homeAway: string | null;
}

/**
 * Whether an edit is worth telling the people called up: time, place, kind of event, opponent, home or away.
 * A new title, note or competition name is not: it would only add noise.
 */
export function isNotableEventChange(before: EventFacts, after: EventFacts): boolean {
  return (
    before.type !== after.type ||
    before.start.getTime() !== after.start.getTime() ||
    before.end.getTime() !== after.end.getTime() ||
    before.venueId !== after.venueId ||
    before.opponentId !== after.opponentId ||
    before.homeAway !== after.homeAway
  );
}

/**
 * Where an email or a push opens. A person in several clubs may tap a notification from a club that is not the active one:
 * `club` tells the app to switch before showing the page, or the page would answer 404.
 */
export function openPath(clubId: string, link: string | null): string {
  const path = link ?? '/notifications';
  return `${path}${path.includes('?') ? '&' : '?'}club=${clubId}`;
}

/** The same with the whole address, for an email. A push uses the path: it opens on the origin of the service worker. */
export const openUrl = (appUrl: string, clubId: string, link: string | null): string => `${appUrl}${openPath(clubId, link)}`;
