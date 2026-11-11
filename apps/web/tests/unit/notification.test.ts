import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_TYPES,
  clubToSwitch,
  notificationText,
  pushState,
  toApplicationServerKey,
  unreadBadge,
  withoutClubQuery,
} from '../../app/utils/notification'

/** A `t` that shows the key and the params, so a test sees which text was chosen and what fills it. */
const t = (key: string, params: Record<string, unknown> = {}) => `${key}${Object.keys(params).length ? ` ${JSON.stringify(params)}` : ''}`

const base = { id: 'n1', link: null, readAt: null, createdAt: '2026-11-10T08:00:00.000Z' }

describe('unreadBadge', () => {
  it('shows nothing for zero, the number up to 99 and 99+ beyond', () => {
    expect(unreadBadge(0)).toBe('')
    expect(unreadBadge(1)).toBe('1')
    expect(unreadBadge(99)).toBe('99')
    expect(unreadBadge(100)).toBe('99+')
  })
  it('ignores what is not a count', () => {
    expect(unreadBadge(-3)).toBe('')
    expect(unreadBadge(Number.NaN)).toBe('')
  })
})

describe('notificationText', () => {
  const event = { club: 'ASD Dakar', kind: 'training', title: 'Speed', start: '2026-12-03T17:00:00.000Z', count: 1 }

  it('has a text for every type the API sends', () => {
    for (const type of NOTIFICATION_TYPES) {
      const view = notificationText({ ...base, type, params: { ...event, expiry: '2026-12-10', days: 30, expiring: 1, expired: 1, person: 'Awa', from: '2026-12-01' } }, 'it', t)
      expect(view.title).toContain('notifications.')
      expect(view.body).toContain('notifications.')
    }
  })

  it('a call-up names the club in the title and the event with its time in the body', () => {
    const view = notificationText({ ...base, type: 'callup', params: event }, 'it', t)
    expect(view.title).toContain('"club":"ASD Dakar"')
    expect(view.body).toContain('Speed')
  })

  it('a change that covers several events uses the plural text, with the count', () => {
    const one = notificationText({ ...base, type: 'event_modified', params: event }, 'it', t)
    const many = notificationText({ ...base, type: 'event_modified', params: { ...event, kind: 'series', start: '', count: 3 } }, 'it', t)
    expect(one.body).not.toBe(many.body)
    expect(many.body).toContain('"count":3')
    const key = (body: string) => body.split(' ')[0]
    expect(key(notificationText({ ...base, type: 'event_modified', params: { ...event, count: 2 } }, 'it', t).body)).toBe(key(many.body))
  })

  it('a cancellation of one event and of a series use different texts', () => {
    const one = notificationText({ ...base, type: 'event_cancelled', params: event }, 'it', t)
    const series = { ...event, kind: 'series', start: '', count: 3, days: '2026-12-03,2026-12-05,2026-12-10' }
    const many = notificationText({ ...base, type: 'event_cancelled', params: series }, 'it', t)
    expect(one.body).toContain('notifications.types.event_cancelled.body')
    expect(many.title).toContain('notifications.types.event_cancelled_many.title')
    expect(many.body).toContain('notifications.types.event_cancelled_many.body')
    expect(many.body).toContain('"count":3')
  })

  it('a removed series lists its days in the language of the reader', () => {
    const view = notificationText({ ...base, type: 'event_cancelled', params: { club: 'C', kind: 'series', title: 'Team training', start: '', count: 3, days: '2026-12-03,2026-12-05,2026-12-10' } }, 'it', t)
    expect(view.body).toContain('"days":"gio 3 dic, sab 5 dic, gio 10 dic"')
  })

  it('a removed series shows five days at most, then how many more', () => {
    const days = ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07'].join(',')
    const view = notificationText({ ...base, type: 'event_cancelled', params: { club: 'C', kind: 'series', title: '', start: '', count: 7, days } }, 'en', t)
    expect(view.body).toContain('Tue 1 Dec, Wed 2 Dec, Thu 3 Dec, Fri 4 Dec, Sat 5 Dec')
    expect(view.body).not.toContain('6 Dec')
    expect(view.body).toContain('Sat 5 Dec notifications.more {\\"n\\":2}')
  })

  it('an absence without an end says "until further notice"', () => {
    const open = notificationText({ ...base, type: 'absence_declared', params: { club: 'C', person: 'Awa', from: '2026-12-01' } }, 'it', t)
    const closed = notificationText({ ...base, type: 'absence_declared', params: { club: 'C', person: 'Awa', from: '2026-12-01', until: '2026-12-15' } }, 'it', t)
    expect(open.body).not.toBe(closed.body)
    expect(open.body).not.toContain('until')
  })

  it('the staff digest picks the text for what is due, and never names anyone', () => {
    const only = (expiring: number, expired: number) => notificationText({ ...base, type: 'certificates_due', params: { club: 'C', expiring, expired } }, 'it', t).body
    expect(only(2, 0)).not.toBe(only(0, 2))
    expect(only(2, 1)).not.toBe(only(2, 0))
    expect(only(2, 1)).toContain('"expiring":2')
  })

  it('a certificate alert says today, tomorrow or in N days, with the text of the language', () => {
    const body = (days: number) => notificationText({ ...base, type: 'certificate_expiring', params: { club: 'C', expiry: '2026-12-10', days } }, 'it', t).body
    expect(body(0)).toContain('notifications.inDays.today')
    expect(body(1)).toContain('notifications.inDays.tomorrow')
    expect(body(15)).toContain('notifications.inDays.other')
    expect(body(15)).toContain('15')
  })

  it('an unknown type from a newer server still shows something, not an error', () => {
    const view = notificationText({ ...base, type: 'from_the_future' as never, params: { club: 'C' } }, 'it', t)
    expect(view.title).toContain('notifications.unknown')
  })

  it('dates are written in the language of the reader', () => {
    const view = notificationText({ ...base, type: 'certificate_expired', params: { club: 'C', expiry: '2026-12-10' } }, 'en', t)
    expect(view.body).toContain('10/12/2026')
  })
})

describe('clubToSwitch', () => {
  const memberships = [{ clubId: 'c1' }, { clubId: 'c2' }]
  it('a link from another club of the account switches to it', () => {
    expect(clubToSwitch('c2', 'c1', memberships)).toBe('c2')
  })
  it('does nothing when already there, without the parameter, or for a club the account does not belong to', () => {
    expect(clubToSwitch('c1', 'c1', memberships)).toBeNull()
    expect(clubToSwitch(undefined, 'c1', memberships)).toBeNull()
    expect(clubToSwitch('c9', 'c1', memberships)).toBeNull()
    expect(clubToSwitch(['c2', 'c1'], 'c1', memberships)).toBeNull()
    expect(clubToSwitch('', 'c1', memberships)).toBeNull()
  })
})

describe('withoutClubQuery', () => {
  it('keeps the rest of the query and the hash', () => {
    expect(withoutClubQuery({ club: 'c2', x: '1' })).toEqual({ x: '1' })
    expect(withoutClubQuery({ club: 'c2' })).toEqual({})
  })
})

describe('pushState', () => {
  const ok = { supported: true, configured: true, permission: 'default' as const, subscribed: false }
  it('unsupported when the browser has no push, even if everything else is fine', () => {
    expect(pushState({ ...ok, supported: false })).toBe('unsupported')
  })
  it('unavailable when the server has no keys', () => {
    expect(pushState({ ...ok, configured: false })).toBe('unavailable')
  })
  it('blocked once the person denied the permission: only the browser settings can undo it', () => {
    expect(pushState({ ...ok, permission: 'denied' })).toBe('blocked')
  })
  it('on only with permission and a subscription, off otherwise', () => {
    expect(pushState({ ...ok, permission: 'granted', subscribed: true })).toBe('on')
    expect(pushState({ ...ok, permission: 'granted', subscribed: false })).toBe('off')
    expect(pushState(ok)).toBe('off')
  })
})

describe('toApplicationServerKey', () => {
  it('decodes the URL-safe base64 of a VAPID key', () => {
    // "AQID" is 01 02 03; URL-safe form swaps + and / for - and _, and drops the padding.
    expect([...toApplicationServerKey('AQID')]).toEqual([1, 2, 3])
    expect([...toApplicationServerKey('-_8')]).toEqual([251, 255])
  })
})
