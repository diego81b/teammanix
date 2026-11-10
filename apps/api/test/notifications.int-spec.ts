import { MailService } from '../src/mail/mail.service';
import { NotificationType } from '../src/entities/enums';
import { PushSubscription } from '../src/entities/push-subscription.entity';
import { PushService } from '../src/notifications/push.service';
import type { PushResult } from '../src/notifications/push.sender';
import { NotificationPreference } from '../src/entities/notification-preference.entity';
import { Notification } from '../src/entities/notification.entity';
import { User } from '../src/entities/user.entity';
import { NotificationsService } from '../src/notifications/notifications.service';
import { Environment, startEnvironment } from './helpers';

describe('notifications service', () => {
  let t: Environment;
  let service: NotificationsService;
  beforeAll(async () => {
    t = await startEnvironment();
    service = t.app.get(NotificationsService);
  });
  afterAll(async () => {
    await t?.close();
  });

  const post = async (token: string, url: string, body: object) => {
    const r = await t.req('POST', url, { token, body });
    expect(r.status).toBe(201);
    return r.body;
  };

  /** A club with an admin and two members that have an account. */
  async function club(tag: string) {
    const s = await t.newUser(`${tag}@test.it`);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${tag}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    const admin = c.body.accessToken as string;
    const member = async (name: string) => {
      const email = `${name}-${tag}@test.it`;
      const p = await post(admin, '/people', { name, surname: 'Rossi', birthDate: '1990-01-01', email });
      await post(admin, '/invitations', { email, role: 'player', personId: p.id });
      const u = await t.newUser(email);
      const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
      expect(acc.status).toBe(200);
      return { userId: u.user.id as string, personId: p.id as string, token: acc.body.accessToken as string };
    };
    return { admin, clubId: c.body.activeClub.id as string, adminUserId: s.user.id as string, a: await member('anna'), b: await member('bea') };
  }

  const rows = (userId: string) => t.orm.em.fork().find(Notification, { user: userId }, { filters: false, orderBy: { createdAt: 'asc' } });
  const base = { type: NotificationType.CALLUP, params: { club: 'X', event: 'Y' }, link: '/events/1' };

  it('creates an in-app notification for each recipient, with type, params and link', async () => {
    const s = await club('n1');
    const created = await service.notify({ clubId: s.clubId, userIds: [s.a.userId, s.b.userId], ...base });
    expect(created).toBe(2);
    const [n] = await rows(s.a.userId);
    expect(n).toMatchObject({ type: 'callup', params: { club: 'X', event: 'Y' }, link: '/events/1', inApp: true, readAt: null });
    expect(await rows(s.b.userId)).toHaveLength(1);
  });

  it('an in-app notification that is turned off is still stored for the other channels, hidden from the center', async () => {
    const s = await club('n2');
    const em = t.orm.em.fork();
    em.create(NotificationPreference, { user: s.a.userId, club: s.clubId, inApp: false, email: true, push: true });
    await em.flush();
    await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base });
    expect((await rows(s.a.userId)).map((n) => n.inApp)).toEqual([false]);
  });

  it('nothing is stored when the person turned every channel off', async () => {
    const s = await club('n3');
    const em = t.orm.em.fork();
    em.create(NotificationPreference, { user: s.a.userId, club: s.clubId, inApp: false, email: false, push: false });
    await em.flush();
    expect(await service.notify({ clubId: s.clubId, userIds: [s.a.userId, s.b.userId], ...base })).toBe(1);
    expect(await rows(s.a.userId)).toEqual([]);
    expect(await rows(s.b.userId)).toHaveLength(1);
  });

  it('the preference of another club does not apply', async () => {
    const s = await club('n4');
    const other = await club('n4b');
    const em = t.orm.em.fork();
    em.create(NotificationPreference, { user: s.a.userId, club: other.clubId, inApp: false, email: false, push: false });
    await em.flush();
    expect(await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base })).toBe(1);
  });

  it('a disabled person receives nothing, and receives again once re-enabled', async () => {
    const s = await club('n5');
    expect((await t.req('POST', `/people/${s.a.personId}/disable`, { token: s.admin })).status).toBe(200);
    expect(await service.notify({ clubId: s.clubId, userIds: [s.a.userId, s.b.userId], ...base })).toBe(1);
    expect(await rows(s.a.userId)).toEqual([]);
    expect((await t.req('POST', `/people/${s.a.personId}/reenable`, { token: s.admin })).status).toBe(200);
    expect(await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base })).toBe(1);
  });

  it('a deactivated account receives nothing', async () => {
    const s = await club('n6');
    const em = t.orm.em.fork();
    (await em.findOneOrFail(User, s.a.userId)).deactivatedAt = new Date();
    await em.flush();
    expect(await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base })).toBe(0);
  });

  it('an admin with no record receives', async () => {
    const s = await club('n7');
    expect(await service.notify({ clubId: s.clubId, userIds: [s.adminUserId], ...base })).toBe(1);
  });

  it('the same dedup key notifies once, in the same call or in a later one', async () => {
    const s = await club('n8');
    const input = { clubId: s.clubId, userIds: [s.a.userId, s.a.userId], ...base, dedupKey: 'cert:1:30d' };
    expect(await service.notify(input)).toBe(1);
    expect(await service.notify(input)).toBe(0);
    expect(await service.notify({ ...input, dedupKey: 'cert:1:15d' })).toBe(1);
    expect(await rows(s.a.userId)).toHaveLength(2);
  });

  describe('the notification center', () => {
    const get = (token: string, url = '/notifications') => t.req('GET', url, { token });
    const post2 = (token: string, url: string) => t.req('POST', url, { token });

    it('lists my notifications of the active club, newest first, with the unread count', async () => {
      const s = await club('c1');
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base, params: { club: 'X', event: 'first' } });
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base, params: { club: 'X', event: 'second' } });
      await service.notify({ clubId: s.clubId, userIds: [s.b.userId], ...base });
      const r = await get(s.a.token);
      expect(r.status).toBe(200);
      expect(r.body.unread).toBe(2);
      expect(r.body.items.map((n: { params: { event: string } }) => n.params.event)).toEqual(['second', 'first']);
      expect(r.body.items[0]).toMatchObject({ type: 'callup', link: '/events/1', readAt: null });
      expect(r.body.items[0]).not.toHaveProperty('dedupKey');
    });

    it('hides what the person turned off for in-app', async () => {
      const s = await club('c2');
      const em = t.orm.em.fork();
      em.create(NotificationPreference, { user: s.a.userId, club: s.clubId, inApp: false, email: true, push: true });
      await em.flush();
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base });
      expect((await get(s.a.token)).body).toEqual({ items: [], unread: 0 });
    });

    it('marks one as read, and the count goes down', async () => {
      const s = await club('c3');
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base });
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base });
      const before = (await get(s.a.token)).body;
      expect((await post2(s.a.token, `/notifications/${before.items[0].id}/read`)).status).toBe(204);
      const after = (await get(s.a.token)).body;
      expect(after.unread).toBe(1);
      expect(after.items.find((n: { id: string }) => n.id === before.items[0].id).readAt).not.toBeNull();
    });

    it('marks all as read', async () => {
      const s = await club('c4');
      for (let i = 0; i < 3; i++) await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base });
      expect((await post2(s.a.token, '/notifications/read-all')).status).toBe(204);
      expect((await get(s.a.token)).body.unread).toBe(0);
    });

    it('nobody reads or marks the notification of someone else, not even in the same club', async () => {
      const s = await club('c5');
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base });
      const mine = (await get(s.a.token)).body.items[0];
      expect((await get(s.b.token)).body).toEqual({ items: [], unread: 0 });
      const r = await post2(s.b.token, `/notifications/${mine.id}/read`);
      expect([r.status, r.body.code]).toEqual([404, 'NOTIFICATION_NOT_FOUND']);
      expect((await get(s.a.token)).body.unread).toBe(1);
      await post2(s.b.token, '/notifications/read-all');
      expect((await get(s.a.token)).body.unread).toBe(1);
    });

    it('does not show the notifications of another club', async () => {
      const s = await club('c6');
      const other = await club('c6b');
      await service.notify({ clubId: other.clubId, userIds: [other.a.userId], ...base });
      expect((await get(s.a.token)).body.unread).toBe(0);
      expect((await get(other.admin)).body.items).toEqual([]);
    });

    it('requires a login', async () => {
      expect((await t.req('GET', '/notifications')).status).toBe(401);
    });

    it('returns at most the requested number of items', async () => {
      const s = await club('c7');
      for (let i = 0; i < 5; i++) await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base });
      const r = await get(s.a.token, '/notifications?limit=2');
      expect(r.body.items).toHaveLength(2);
      expect(r.body.unread).toBe(5);
    });
  });

  describe('preferences', () => {
    const put = (token: string, clubId: string, body: object) => t.req('PUT', `/notifications/preferences/${clubId}`, { token, body });
    const off = { inApp: false, email: false, push: false };

    /** The same account is also a player of a second club. */
    async function twoClubs(tag: string) {
      const s = await club(tag);
      const other = await club(`${tag}b`);
      const email = `anna-${tag}@test.it`;
      const p = await post(other.admin, '/people', { name: 'anna', surname: 'Rossi', birthDate: '1990-01-01', email });
      await post(other.admin, '/invitations', { email, role: 'player', personId: p.id });
      const login = await t.req('POST', '/auth/login', { body: { email, password: 'password-long-123' } });
      const acc = await t.req('POST', '/invitations/accept', { token: login.body.accessToken, body: { token: t.tokenInvitation(email) } });
      expect(acc.status).toBe(200);
      return { s, other };
    }

    it('lists every club of the account with all channels on by default', async () => {
      const { s, other } = await twoClubs('pr1');
      const r = await t.req('GET', '/notifications/preferences', { token: s.a.token });
      expect(r.status).toBe(200);
      expect(r.body).toEqual([
        { clubId: s.clubId, name: 'Club pr1', inApp: true, email: true, push: true },
        { clubId: other.clubId, name: 'Club pr1b', inApp: true, email: true, push: true },
      ]);
    });

    it('saves a choice per club and per channel, leaving the other club alone', async () => {
      const { s, other } = await twoClubs('pr2');
      expect((await put(s.a.token, other.clubId, { inApp: true, email: false, push: true })).status).toBe(200);
      const r = await t.req('GET', '/notifications/preferences', { token: s.a.token });
      expect(r.body.find((c: { clubId: string }) => c.clubId === other.clubId)).toMatchObject({ inApp: true, email: false, push: true });
      expect(r.body.find((c: { clubId: string }) => c.clubId === s.clubId)).toMatchObject({ inApp: true, email: true, push: true });
      expect((await put(s.a.token, other.clubId, { inApp: true, email: true, push: false })).body).toMatchObject({ email: true, push: false });
    });

    it('a saved choice is what the sending uses', async () => {
      const s = await club('pr3');
      expect((await put(s.a.token, s.clubId, off)).status).toBe(200);
      expect(await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base })).toBe(0);
      expect((await put(s.a.token, s.clubId, { ...off, inApp: true })).status).toBe(200);
      expect(await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base })).toBe(1);
    });

    it('only the account itself changes its choice, and only for a club it belongs to', async () => {
      const s = await club('pr4');
      const stranger = await club('pr4b');
      const r = await put(s.a.token, stranger.clubId, off);
      expect([r.status, r.body.code]).toEqual([403, 'NOT_CLUB_MEMBER']);
      await put(s.b.token, s.clubId, off);
      expect((await t.req('GET', '/notifications/preferences', { token: s.a.token })).body[0]).toMatchObject({ inApp: true });
    });

    it('rejects a body that is not three booleans', async () => {
      const s = await club('pr5');
      for (const body of [{}, { inApp: true, email: true }, { inApp: 'yes', email: true, push: true }]) {
        const r = await put(s.a.token, s.clubId, body);
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATA']);
      }
    });

    it('leaving the club deletes the choice for that club', async () => {
      const s = await club('pr6');
      await put(s.a.token, s.clubId, off);
      expect(await t.orm.em.fork().count(NotificationPreference, { user: s.a.userId, club: s.clubId })).toBe(1);
      expect((await t.req('POST', '/club/current/detachment', { token: s.a.token })).status).toBeLessThan(300);
      expect(await t.orm.em.fork().count(NotificationPreference, { user: s.a.userId, club: s.clubId })).toBe(0);
    });
  });

  describe('email', () => {
    const mailsTo = (email: string) => t.mail.outbox.filter((m) => m.to === email);
    const callup = { type: NotificationType.CALLUP, params: { club: 'Club em', kind: 'training', title: 'Speed', start: '2026-12-03T17:00:00.000Z', count: 1 }, link: '/events/e1' };

    it('sends the notification to the account email, with the club in the subject and a link that opens that club', async () => {
      const s = await club('em1'); t.mail.outbox.length = 0;
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...callup });
      const [m] = mailsTo('anna-em1@test.it');
      expect(m?.subject).toContain('Club em');
      expect(m?.text).toContain(`/events/e1?club=${s.clubId}`);
    });

    it('is written in the language of the recipient', async () => {
      const s = await club('em2'); t.mail.outbox.length = 0;
      const em = t.orm.em.fork();
      (await em.findOneOrFail(User, s.a.userId)).language = 'fr' as never;
      await em.flush();
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...callup });
      expect(mailsTo('anna-em2@test.it')[0]?.subject).toMatch(/convocation/);
    });

    it('records when the email went out', async () => {
      const s = await club('em3'); t.mail.outbox.length = 0;
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...callup });
      const [n] = await rows(s.a.userId);
      expect(n?.emailSentAt).toBeInstanceOf(Date);
    });

    it('sends nothing when the person turned email off, but still notifies in app', async () => {
      const s = await club('em4'); t.mail.outbox.length = 0;
      const em = t.orm.em.fork();
      em.create(NotificationPreference, { user: s.a.userId, club: s.clubId, inApp: true, email: false, push: true });
      await em.flush();
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...callup });
      expect(mailsTo('anna-em4@test.it')).toEqual([]);
      const [n] = await rows(s.a.userId);
      expect(n).toMatchObject({ inApp: true, emailSentAt: null });
    });

    it('email alone is enough: with in-app off the mail still goes out', async () => {
      const s = await club('em5'); t.mail.outbox.length = 0;
      const em = t.orm.em.fork();
      em.create(NotificationPreference, { user: s.a.userId, club: s.clubId, inApp: false, email: true, push: false });
      await em.flush();
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...callup });
      expect(mailsTo('anna-em5@test.it')).toHaveLength(1);
    });

    it('a type that does not use email by default sends none', async () => {
      const s = await club('em6'); t.mail.outbox.length = 0;
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...callup, type: NotificationType.EVENT_MODIFIED });
      expect(mailsTo('anna-em6@test.it')).toEqual([]);
    });

    it('a failed send never throws and leaves the notification stored', async () => {
      const s = await club('em7'); t.mail.outbox.length = 0;
      const spy = jest.spyOn(t.app.get(MailService), 'send').mockRejectedValueOnce(new Error('boom'));
      await expect(service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...callup })).resolves.toBe(1);
      spy.mockRestore();
      const [n] = await rows(s.a.userId);
      expect(n).toMatchObject({ emailSentAt: null });
    });

    it('a transport that refuses leaves emailSentAt empty', async () => {
      const s = await club('em8'); t.mail.outbox.length = 0;
      const spy = jest.spyOn(t.app.get(MailService), 'send').mockResolvedValueOnce(false);
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...callup });
      spy.mockRestore();
      expect((await rows(s.a.userId))[0]?.emailSentAt).toBeNull();
    });
  });

  describe('push', () => {
    const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`, keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` } });
    const subscribe = (token: string, body: object) => t.req('PUT', '/notifications/push/subscription', { token, body });
    const callup = { type: NotificationType.CALLUP, params: { club: 'Club pu', kind: 'training', title: 'Speed', start: '2026-12-03T17:00:00.000Z', count: 1 }, link: '/events/e1' };
    let sent: { endpoint: string; payload: any }[];
    let answer: PushResult;
    let push: PushService;
    beforeEach(() => {
      sent = [];
      answer = 'ok';
      push = t.app.get(PushService);
      push.sender = {
        send: async (target, payload) => {
          sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
          return answer;
        },
      };
      process.env.VAPID_PUBLIC_KEY = 'public-key';
      process.env.VAPID_PRIVATE_KEY = 'private-key';
    });
    afterEach(() => {
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
    });
    const devices = (userId: string) => t.orm.em.fork().find(PushSubscription, { user: userId });

    it('serves the public key, or says push is not configured', async () => {
      const s = await club('pu1');
      expect((await t.req('GET', '/notifications/push/key', { token: s.a.token })).body).toEqual({ publicKey: 'public-key' });
      delete process.env.VAPID_PUBLIC_KEY;
      const r = await t.req('GET', '/notifications/push/key', { token: s.a.token });
      expect([r.status, r.body.code]).toEqual([404, 'PUSH_NOT_CONFIGURED']);
    });

    it('registers a device once, however many times it subscribes', async () => {
      const s = await club('pu2');
      expect((await subscribe(s.a.token, sub(1))).status).toBe(204);
      expect((await subscribe(s.a.token, sub(1))).status).toBe(204);
      expect((await subscribe(s.a.token, sub(2))).status).toBe(204);
      expect((await devices(s.a.userId)).map((d) => d.endpoint).sort()).toEqual([sub(1).endpoint, sub(2).endpoint]);
    });

    it('a device that changes account goes to the new one', async () => {
      const s = await club('pu3');
      await subscribe(s.a.token, sub(1));
      await subscribe(s.b.token, sub(1));
      expect(await devices(s.a.userId)).toEqual([]);
      expect(await devices(s.b.userId)).toHaveLength(1);
    });

    it('rejects a malformed subscription', async () => {
      const s = await club('pu4');
      for (const body of [{}, { endpoint: 'not a url', keys: { p256dh: 'a', auth: 'b' } }, { endpoint: 'https://169.254.169.254/x', keys: { p256dh: 'a', auth: 'b' } }, { endpoint: 'https://push.test/x', keys: { p256dh: 'a', auth: 'b' } }, { endpoint: sub(1).endpoint, keys: {} }]) {
        const r = await subscribe(s.a.token, body);
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATA']);
      }
    });

    it('refuses to register a device when push is not configured', async () => {
      const s = await club('pu5');
      delete process.env.VAPID_PRIVATE_KEY;
      expect((await subscribe(s.a.token, sub(1))).status).toBe(404);
    });

    it('removes a device on request, and only the caller own', async () => {
      const s = await club('pu6');
      await subscribe(s.a.token, sub(1));
      await t.req('DELETE', '/notifications/push/subscription', { token: s.b.token, body: { endpoint: sub(1).endpoint } });
      expect(await devices(s.a.userId)).toHaveLength(1);
      expect((await t.req('DELETE', '/notifications/push/subscription', { token: s.a.token, body: { endpoint: sub(1).endpoint } })).status).toBe(204);
      expect(await devices(s.a.userId)).toEqual([]);
    });

    it('pushes to every device of the person, with the club in the title, a link that opens that club and no health data', async () => {
      const s = await club('pu7');
      await subscribe(s.a.token, sub(1));
      await subscribe(s.a.token, sub(2));
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...callup });
      expect(sent.map((x) => x.endpoint).sort()).toEqual([sub(1).endpoint, sub(2).endpoint]);
      expect(sent[0]?.payload).toMatchObject({ title: expect.stringContaining('Club pu'), url: `/events/e1?club=${s.clubId}` });
      expect(Object.keys(sent[0]?.payload).sort()).toEqual(['body', 'tag', 'title', 'url']);
      expect((await rows(s.a.userId))[0]?.pushSentAt).toBeInstanceOf(Date);
    });

    it('sends nothing when the person turned push off, and nothing to people without a device', async () => {
      const s = await club('pu8');
      await subscribe(s.a.token, sub(1));
      await subscribe(s.b.token, sub(2));
      const em = t.orm.em.fork();
      em.create(NotificationPreference, { user: s.a.userId, club: s.clubId, inApp: true, email: true, push: false });
      await em.flush();
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId, s.b.userId], ...callup });
      expect(sent.map((x) => x.endpoint)).toEqual([sub(2).endpoint]);
      await service.notify({ clubId: s.clubId, userIds: [s.adminUserId], ...callup });
      expect(sent).toHaveLength(1);
      expect((await rows(s.adminUserId))[0]?.pushSentAt).toBeNull();
    });

    it('forgets a device the push service says is gone', async () => {
      const s = await club('pu9');
      await subscribe(s.a.token, sub(1));
      answer = 'gone';
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...callup });
      expect(await devices(s.a.userId)).toEqual([]);
      expect((await rows(s.a.userId))[0]?.pushSentAt).toBeNull();
    });

    it('keeps a device after a transient failure and records it', async () => {
      const s = await club('pu10');
      await subscribe(s.a.token, sub(1));
      answer = 'error';
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...callup });
      const [d] = await devices(s.a.userId);
      expect(d?.lastErrorAt).toBeInstanceOf(Date);
    });

    it('a sender that throws never reaches the caller', async () => {
      const s = await club('pu11');
      await subscribe(s.a.token, sub(1));
      push.sender = { send: async () => Promise.reject(new Error('boom')) };
      await expect(service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...callup })).resolves.toBe(1);
    });

    it('without VAPID keys nothing is attempted', async () => {
      const s = await club('pu12');
      await subscribe(s.a.token, sub(1));
      delete process.env.VAPID_PRIVATE_KEY;
      await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...callup });
      expect(sent).toEqual([]);
    });
  });

  it('notifications without a dedup key never collide', async () => {
    const s = await club('n9');
    await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base });
    await service.notify({ clubId: s.clubId, userIds: [s.a.userId], ...base });
    expect(await rows(s.a.userId)).toHaveLength(2);
  });
});
