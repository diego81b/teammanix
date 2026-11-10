import { NotificationType } from '../entities/enums';
import { DEFAULT_CHANNELS, hasAnyChannel, isEligibleRecipient, isNotableEventChange, openPath, openUrl, resolveChannels } from './notification.rules';

const ALL = { inApp: true, email: true, push: true };

describe('resolveChannels', () => {
  it('without a stored preference the type defaults apply', () => {
    expect(resolveChannels(NotificationType.CALLUP, null)).toEqual(ALL);
    expect(resolveChannels(NotificationType.EVENT_MODIFIED, null)).toEqual({ inApp: true, email: false, push: true });
  });

  it('a channel the person turned off is off, whatever the type default', () => {
    expect(resolveChannels(NotificationType.CALLUP, { inApp: true, email: false, push: true })).toEqual({ inApp: true, email: false, push: true });
    expect(resolveChannels(NotificationType.CALLUP, { inApp: false, email: false, push: false })).toEqual({ inApp: false, email: false, push: false });
  });

  it('a person cannot turn on a channel the type does not use by default', () => {
    expect(resolveChannels(NotificationType.EVENT_MODIFIED, ALL).email).toBe(false);
  });

  it('every notification type has a default', () => {
    for (const t of Object.values(NotificationType)) expect(DEFAULT_CHANNELS[t]).toBeDefined();
  });
});

describe('hasAnyChannel', () => {
  it('is false only when every channel is off', () => {
    expect(hasAnyChannel({ inApp: false, email: false, push: false })).toBe(false);
    expect(hasAnyChannel({ inApp: false, email: true, push: false })).toBe(true);
  });
});

describe('isEligibleRecipient', () => {
  const active = { deactivatedAt: null, people: [{ disabledAt: null }] };

  it('an active account with an active record receives', () => {
    expect(isEligibleRecipient(active)).toBe(true);
  });

  it('a deactivated account receives nothing', () => {
    expect(isEligibleRecipient({ ...active, deactivatedAt: new Date() })).toBe(false);
  });

  it('a disabled person receives nothing (rule 12)', () => {
    expect(isEligibleRecipient({ deactivatedAt: null, people: [{ disabledAt: new Date() }] })).toBe(false);
  });

  it('an account with no record in the club (an admin) receives', () => {
    expect(isEligibleRecipient({ deactivatedAt: null, people: [] })).toBe(true);
  });
});

describe('isNotableEventChange', () => {
  const before = { type: 'match', start: new Date('2026-12-01T16:00:00Z'), end: new Date('2026-12-01T17:30:00Z'), venueId: 'v1', opponentId: 'o1', homeAway: 'home' };

  it('is false when nothing a player plans around changed', () => {
    expect(isNotableEventChange(before, { ...before, start: new Date(before.start) })).toBe(false);
  });

  it.each([
    ['start', { start: new Date('2026-12-01T17:00:00Z') }],
    ['end', { end: new Date('2026-12-01T18:00:00Z') }],
    ['venue', { venueId: 'v2' }],
    ['venue removed', { venueId: null }],
    ['type', { type: 'training' }],
    ['opponent', { opponentId: 'o2' }],
    ['home or away', { homeAway: 'away' }],
  ])('is true when the %s changes', (_, change) => {
    expect(isNotableEventChange(before, { ...before, ...change })).toBe(true);
  });
});

describe('openPath', () => {
  it('is the path inside the app, for a push, which opens on its own origin', () => {
    expect(openPath('c1', '/events/e1')).toBe('/events/e1?club=c1');
    expect(openPath('c1', null)).toBe('/notifications?club=c1');
  });
});

describe('openUrl', () => {
  it('opens the link in the club that sent the notification', () => {
    expect(openUrl('https://app.test', 'c1', '/events/e1')).toBe('https://app.test/events/e1?club=c1');
    expect(openUrl('https://app.test', 'c1', '/calendar?x=1')).toBe('https://app.test/calendar?x=1&club=c1');
  });

  it('without a link it opens the notification center', () => {
    expect(openUrl('https://app.test', 'c1', null)).toBe('https://app.test/notifications?club=c1');
  });
});
