import { formatDate, formatShortDay } from './date'
import { splitInstant } from './event'

/**
 * Notification rules, pure: no router, store or browser API. The API sends `type` and `params` only; the text of the
 * in-app center is built here, in the language of the reader (email and push are rendered by the server).
 */
export const NOTIFICATION_TYPES = [
  'callup',
  'event_modified',
  'event_cancelled',
  'certificate_expiring',
  'certificate_expired',
  'certificates_due',
  'absence_declared',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export interface NotificationItem {
  id: string
  type: NotificationType
  params: Record<string, string | number>
  /** Path inside the app, or null for the center itself. */
  link: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationList {
  items: NotificationItem[]
  unread: number
}

export interface NotificationPreference {
  clubId: string
  name: string
  inApp: boolean
  email: boolean
  push: boolean
}

/** Count on the bell: nothing for zero, "99+" beyond two digits. */
export function unreadBadge(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return ''
  return count > 99 ? '99+' : String(Math.floor(count))
}

export type Translate = (key: string, params?: Record<string, unknown>) => string

const EVENT_KINDS = ['training', 'match', 'other']
const str = (v: string | number | undefined): string => (v === undefined ? '' : String(v))

/** The event as the text names it: its title, or its kind when it has none. */
function what(p: Record<string, string | number>, t: Translate): string {
  const kind = EVENT_KINDS.includes(str(p.kind)) ? str(p.kind) : 'other'
  return str(p.title) || t(`events.type.${kind}`)
}

/** "today", "tomorrow" or "in N days": the three texts differ in the languages, so they are keys, not a plural. */
function inDays(days: unknown, t: Translate): string {
  const n = Math.max(0, Math.floor(Number(days)))
  if (!Number.isFinite(n)) return ''
  return t(`notifications.inDays.${n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'other'}`, { n })
}

function when(start: string | number | undefined, locale: string): string {
  if (!start) return ''
  const { date, time } = splitInstant(String(start))
  return `${formatDate(date, locale)} · ${time}`
}

/** How many days a text lists before it counts the rest: a long series must not fill a lock screen. */
const LISTED_DAYS = 5

/** The days of a removed series (`YYYY-MM-DD` joined by commas): the first few, then how many more. */
function removedDays(days: string | number | undefined, locale: string, t: Translate): string {
  const all = str(days).split(',').filter(Boolean)
  const shown = all.slice(0, LISTED_DAYS).map(d => formatShortDay(d, locale)).join(', ')
  const rest = all.length - LISTED_DAYS
  return rest > 0 ? `${shown} ${t('notifications.more', { n: rest })}` : shown
}

/** Which of the texts of a type applies: some types have a plural or an optional part. */
function variant(n: Pick<NotificationItem, 'type' | 'params'>): string {
  const p = n.params
  switch (n.type) {
    case 'event_modified':
      return Number(p.count) > 1 || p.kind === 'series' ? 'event_modified_many' : 'event_modified'
    case 'event_cancelled':
      return p.kind === 'series' ? 'event_cancelled_many' : 'event_cancelled'
    case 'absence_declared':
      return p.until ? 'absence_declared' : 'absence_declared_open'
    case 'certificates_due':
      if (Number(p.expiring) > 0 && Number(p.expired) > 0) return 'certificates_due_both'
      return Number(p.expired) > 0 ? 'certificates_due_expired' : 'certificates_due_expiring'
    default:
      return n.type
  }
}

/** Title and body of a notification, in the language of the reader. An unknown type (a newer server) still reads sensibly. */
export function notificationText(n: Pick<NotificationItem, 'type' | 'params'>, locale: string, t: Translate): { title: string, body: string } {
  if (!NOTIFICATION_TYPES.includes(n.type)) return { title: t('notifications.unknown.title'), body: t('notifications.unknown.body') }
  const p = n.params
  const params: Record<string, unknown> = { ...p, what: what(p, t), when: when(p.start, locale) }
  if (n.type === 'certificate_expiring') params.inDays = inDays(p.days, t)
  if (n.type === 'event_cancelled' && p.kind === 'series') params.days = removedDays(p.days, locale, t)
  for (const key of ['expiry', 'from', 'until']) if (p[key]) params[key] = formatDate(String(p[key]), locale)
  const v = variant(n)
  const body = t(`notifications.types.${v}.body`, params)
  // The digest of a team opens with the team, as the text sent by the server does.
  const named = n.type === 'certificates_due' && p.team
  return { title: t(`notifications.types.${v}.title`, params), body: named ? t('notifications.forTeam', { team: str(p.team), text: body }) : body }
}

/** A link with `?club=` opens in that club: the notification may come from a club that is not the active one. */
export function clubToSwitch(
  query: unknown,
  active: string | null,
  memberships: readonly { clubId: string }[],
): string | null {
  if (typeof query !== 'string' || !query || query === active) return null
  return memberships.some(m => m.clubId === query) ? query : null
}

/** The query without `club`, so the address does not keep asking to switch. */
export function withoutClubQuery(query: Record<string, unknown>): Record<string, unknown> {
  const { club: _club, ...rest } = query
  return rest
}

export type PushState = 'unsupported' | 'unavailable' | 'blocked' | 'off' | 'on'

/**
 * What the push switch should show. `blocked` means the person denied the permission: the app cannot ask again, only the
 * browser settings can undo it. The permission is requested only from a tap, never at startup.
 */
export function pushState(s: {
  supported: boolean
  configured: boolean
  permission: NotificationPermission
  subscribed: boolean
}): PushState {
  if (!s.supported) return 'unsupported'
  if (!s.configured) return 'unavailable'
  if (s.permission === 'denied') return 'blocked'
  return s.permission === 'granted' && s.subscribed ? 'on' : 'off'
}

/** The VAPID public key comes as URL-safe base64; `PushManager.subscribe` wants the bytes. */
export function toApplicationServerKey(key: string): Uint8Array<ArrayBuffer> {
  const padded = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
