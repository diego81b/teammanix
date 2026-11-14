import { NotificationType } from '../src/entities/enums';
import { Notification } from '../src/entities/notification.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment, createTeams } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const slot = (offset: number) => ({ start: `${day(offset)}T16:00:00Z`, end: `${day(offset)}T17:30:00Z` });
/** The same day, one and a half hours later. */
const later = (offset: number) => ({ start: `${day(offset)}T18:00:00Z`, end: `${day(offset)}T19:30:00Z` });

describe('who gets notified by call-ups and event changes', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
    const em = t.orm.em.fork();
    em.create(SportProfile, { code: 'football', positions: ['goalkeeper'], starterBench: true, maxStarters: 11, modulesAvailable: ['attendances'] } as never);
    await em.flush();
  });
  afterAll(async () => {
    await t?.close();
  });

  const send = (token: string, method: string, url: string, body?: object) => t.req(method, url, { token, body });
  const post = async (token: string, url: string, body: object) => {
    const r = await t.req('POST', url, { token, body });
    expect(r.status).toBe(201);
    return r.body;
  };

  /** A club with one team in an active season: a coach and two players, all with an account, plus a player without one. */
  async function club(tag: string) {
    const s = await t.newUser(`${tag}@test.it`);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${tag}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    const admin = c.body.accessToken as string;
    const struct = await createTeams(t.req, admin, { sportProfile: 'football' });
    const team = await struct.team('T1');
    const season = await post(admin, `/teams/${team.id}/seasons`, { name: 'Now', startDate: day(-60), endDate: day(400) });
    const member = async (name: string, type: 'player' | 'staff', account = true) => {
      const email = `${name}-${tag}@test.it`;
      const p = await post(admin, '/people', { name, surname: 'Rossi', birthDate: '1990-01-01', email });
      const enrollment = await post(admin, `/seasons/${season.id}/enrollments`, { personId: p.id, type, ...(type === 'staff' ? { staffRole: 'coach' } : {}) });
      if (type === 'player') await post(admin, `/people/${p.id}/certificates`, { type: 'competitive', issueDate: day(-10), expiryDate: day(365) });
      if (!account) return { personId: p.id as string, enrollmentId: enrollment.id as string, userId: '', token: '' };
      await post(admin, '/invitations', { email, role: type, personId: p.id });
      const u = await t.newUser(email);
      const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
      expect(acc.status).toBe(200);
      return { personId: p.id as string, enrollmentId: enrollment.id as string, userId: u.user.id as string, token: acc.body.accessToken as string };
    };
    const coach = await member('coach', 'staff');
    const anna = await member('anna', 'player');
    const bea = await member('bea', 'player');
    const noAccount = await member('carl', 'player', false);
    expect((await t.req('POST', `/seasons/${season.id}/active`, { token: admin })).status).toBe(200);
    return { admin, teamId: team.id as string, seasonId: season.id as string, coach, anna, bea, noAccount };
  }
  type Scenario = Awaited<ReturnType<typeof club>>;

  const ofUser = (userId: string, type?: NotificationType) =>
    t.orm.em.fork().find(Notification, { user: userId, ...(type ? { type } : {}) }, { filters: false, orderBy: { createdAt: 'asc' } });
  const callUp = async (s: Scenario, eventId: string, ...who: { enrollmentId: string }[]) => {
    for (const w of who) await post(s.coach.token, `/events/${eventId}/callups`, { enrollmentId: w.enrollmentId });
  };
  const sendCallUps = async (s: Scenario, eventId: string) => {
    const r = await send(s.coach.token, 'POST', `/events/${eventId}/callups/send`);
    expect(r.status).toBe(200);
  };

  describe('sending call-ups', () => {
    it('each new player gets a call-up notification with the club, the event and a link; nobody else does', async () => {
      const s = await club('p1');
      const ev = await post(s.admin, `/teams/${s.teamId}/events`, { type: 'training', title: 'Speed', ...slot(5) });
      await callUp(s, ev.id, s.anna, s.bea, s.noAccount);
      await sendCallUps(s, ev.id);
      const [n] = await ofUser(s.anna.userId, NotificationType.CALLUP);
      expect(n).toMatchObject({ link: `/events/${ev.id}`, inApp: true, params: { club: 'Club p1', kind: 'training', title: 'Speed', start: `${day(5)}T16:00:00.000Z` } });
      expect(await ofUser(s.bea.userId, NotificationType.CALLUP)).toHaveLength(1);
      expect(await ofUser(s.coach.userId)).toEqual([]);
    });

    it('sending again notifies only the players added since', async () => {
      const s = await club('p2');
      const ev = await post(s.admin, `/teams/${s.teamId}/events`, { type: 'training', ...slot(5) });
      await callUp(s, ev.id, s.anna);
      await sendCallUps(s, ev.id);
      await callUp(s, ev.id, s.bea);
      await sendCallUps(s, ev.id);
      expect(await ofUser(s.anna.userId, NotificationType.CALLUP)).toHaveLength(1);
      expect(await ofUser(s.bea.userId, NotificationType.CALLUP)).toHaveLength(1);
    });

    it('a disabled player is not notified', async () => {
      const s = await club('p3');
      const ev = await post(s.admin, `/teams/${s.teamId}/events`, { type: 'training', ...slot(5) });
      await callUp(s, ev.id, s.anna, s.bea);
      expect((await send(s.admin, 'POST', `/people/${s.anna.personId}/disable`)).status).toBe(200);
      await sendCallUps(s, ev.id);
      expect(await ofUser(s.anna.userId)).toEqual([]);
      expect(await ofUser(s.bea.userId)).toHaveLength(1);
    });
  });

  describe('changing an event', () => {
    async function calledUp(tag: string) {
      const s = await club(tag);
      const ev = await post(s.admin, `/teams/${s.teamId}/events`, { type: 'training', title: 'Speed', ...slot(5) });
      await callUp(s, ev.id, s.anna);
      await sendCallUps(s, ev.id);
      await callUp(s, ev.id, s.bea); // called up but not sent
      return { s, ev };
    }
    const edit = (s: Scenario, id: string, body: object) => send(s.coach.token, 'PATCH', `/events/${id}`, body);

    it('a new time notifies the players whose call-up was sent, not the others', async () => {
      const { s, ev } = await calledUp('e1');
      expect((await edit(s, ev.id, { ...later(5) })).status).toBe(200);
      const [n] = await ofUser(s.anna.userId, NotificationType.EVENT_MODIFIED);
      expect(n).toMatchObject({ link: `/events/${ev.id}`, params: { club: 'Club e1', kind: 'training', title: 'Speed', start: `${day(5)}T18:00:00.000Z`, count: 1 } });
      expect(await ofUser(s.bea.userId, NotificationType.EVENT_MODIFIED)).toEqual([]);
      expect(await ofUser(s.coach.userId)).toEqual([]);
    });

    it('a new title or note alone does not notify', async () => {
      const { s, ev } = await calledUp('e2');
      expect((await edit(s, ev.id, { title: 'Other title', note: 'Bring water' })).status).toBe(200);
      expect(await ofUser(s.anna.userId, NotificationType.EVENT_MODIFIED)).toEqual([]);
    });

    it('cancelling notifies with its own type', async () => {
      const { s, ev } = await calledUp('e3');
      expect((await send(s.coach.token, 'POST', `/events/${ev.id}/cancel`)).status).toBe(200);
      expect(await ofUser(s.anna.userId, NotificationType.EVENT_CANCELLED)).toHaveLength(1);
      expect(await ofUser(s.anna.userId, NotificationType.EVENT_MODIFIED)).toEqual([]);
    });

    it('postponing notifies as a change', async () => {
      const { s, ev } = await calledUp('e4');
      expect((await send(s.coach.token, 'POST', `/events/${ev.id}/postpone`)).status).toBe(200);
      expect(await ofUser(s.anna.userId, NotificationType.EVENT_MODIFIED)).toHaveLength(1);
    });

    it('a player removed from the call-up is not told about a later change', async () => {
      const { s, ev } = await calledUp('e5');
      expect((await send(s.coach.token, 'DELETE', `/events/${ev.id}/callups/${s.anna.enrollmentId}`)).status).toBe(204);
      await edit(s, ev.id, { ...later(5) });
      expect(await ofUser(s.anna.userId, NotificationType.EVENT_MODIFIED)).toEqual([]);
    });

    it('a refused edit notifies nobody', async () => {
      const { s, ev } = await calledUp('e6');
      expect((await send(s.anna.token, 'PATCH', `/events/${ev.id}`, { ...later(5) })).status).toBe(403);
      expect(await ofUser(s.anna.userId, NotificationType.EVENT_MODIFIED)).toEqual([]);
    });
  });

  describe('changing a series for all future events', () => {
    it('a player called up to several of its events gets one notification with the count', async () => {
      const s = await club('s1');
      const created = await post(s.coach.token, `/teams/${s.teamId}/series`, {
        type: 'training',
        title: 'Weekly',
        weekdays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
        startDate: day(1),
        endDate: day(10),
        timeStart: '18:00',
        durationMinutes: 90,
      });
      const all = (await send(s.admin, 'GET', `/seasons/${s.seasonId}/events`)).body as { id: string; seriesId: string | null; start: string }[];
      const events = all.filter((e) => e.seriesId === created.id).sort((x, y) => x.start.localeCompare(y.start));
      expect(events.length).toBeGreaterThan(3);
      for (const e of events.slice(0, 3)) {
        await callUp(s, e.id, s.anna);
        await sendCallUps(s, e.id);
      }
      await callUp(s, (events[3] as { id: string }).id, s.bea);
      await sendCallUps(s, (events[3] as { id: string }).id);
      const before = (await ofUser(s.anna.userId, NotificationType.EVENT_MODIFIED)).length;
      expect((await send(s.coach.token, 'PATCH', `/series/${created.id}`, { timeStart: '19:00' })).status).toBe(200);
      const mine = (await ofUser(s.anna.userId, NotificationType.EVENT_MODIFIED)).slice(before);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ link: '/calendar', params: { club: 'Club s1', kind: 'series', title: 'Weekly', count: 3 } });
      const bea = await ofUser(s.bea.userId, NotificationType.EVENT_MODIFIED);
      expect(bea).toHaveLength(1);
      expect(bea[0]?.params).toMatchObject({ count: 1 });
    });

    it('a series change that moves nothing notifies nobody', async () => {
      const s = await club('s2');
      const created = await post(s.coach.token, `/teams/${s.teamId}/series`, {
        type: 'training',
        weekdays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
        startDate: day(1),
        endDate: day(5),
        timeStart: '18:00',
        durationMinutes: 90,
      });
      const all = (await send(s.admin, 'GET', `/seasons/${s.seasonId}/events`)).body as { id: string; seriesId: string | null }[];
      const first = all.find((e) => e.seriesId === created.id) as { id: string };
      await callUp(s, first.id, s.anna);
      await sendCallUps(s, first.id);
      expect((await send(s.coach.token, 'PATCH', `/series/${created.id}`, { title: 'Renamed' })).status).toBe(200);
      expect(await ofUser(s.anna.userId, NotificationType.EVENT_MODIFIED)).toEqual([]);
    });
  });

  describe('removing the future sessions of a series', () => {
    const localDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(iso));
    type Ev = { id: string; seriesId: string | null; start: string };

    async function weekly(tag: string) {
      const s = await club(tag);
      const created = await post(s.coach.token, `/teams/${s.teamId}/series`, {
        type: 'training',
        title: 'Weekly',
        weekdays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
        startDate: day(1),
        endDate: day(10),
        timeStart: '18:00',
        durationMinutes: 90,
      });
      const all = (await send(s.admin, 'GET', `/seasons/${s.seasonId}/events`)).body as Ev[];
      const events = all.filter((e) => e.seriesId === created.id).sort((x, y) => x.start.localeCompare(y.start));
      return { s, created, events };
    }

    it('a player with a sent call-up on several removed sessions gets one notification that lists the days, with no link to a session that is gone', async () => {
      const { s, created, events } = await weekly('r1');
      const [e0, e1, e2, e3, e4] = events as [Ev, Ev, Ev, Ev, Ev];
      for (const e of [e0, e1, e2]) {
        await callUp(s, e.id, s.anna);
        await sendCallUps(s, e.id);
      }
      await callUp(s, e3.id, s.bea);
      await sendCallUps(s, e3.id);
      await callUp(s, e4.id, s.bea); // never sent: bea does not know about it, so it is not news to her

      const r = await send(s.coach.token, 'DELETE', `/series/${created.id}/future-sessions`);
      expect([r.status, r.body]).toEqual([200, { sessions: events.length, players: 2, kept: 0 }]);

      const anna = await ofUser(s.anna.userId, NotificationType.EVENT_CANCELLED);
      expect(anna).toHaveLength(1);
      expect(anna[0]).toMatchObject({
        link: '/calendar',
        params: { club: 'Club r1', kind: 'series', title: 'Weekly', count: 3, days: [e0, e1, e2].map((e) => localDay(e.start)).join(',') },
      });
      const bea = await ofUser(s.bea.userId, NotificationType.EVENT_CANCELLED);
      expect(bea).toHaveLength(1);
      expect(bea[0]?.params).toMatchObject({ count: 1, days: localDay(e3.start) });
    });

    it('a player with no call-up, and a player without an account, are not notified', async () => {
      const { s, created, events } = await weekly('r2');
      const first = events[0] as Ev;
      await callUp(s, first.id, s.anna, s.noAccount);
      await sendCallUps(s, first.id);
      expect((await send(s.coach.token, 'DELETE', `/series/${created.id}/future-sessions`)).status).toBe(200);
      expect(await ofUser(s.bea.userId, NotificationType.EVENT_CANCELLED)).toEqual([]);
      expect(await ofUser(s.anna.userId, NotificationType.EVENT_CANCELLED)).toHaveLength(1);
    });

    it('a refused removal notifies nobody and removes nothing', async () => {
      const { s, created, events } = await weekly('r3');
      const first = events[0] as Ev;
      await callUp(s, first.id, s.anna);
      await sendCallUps(s, first.id);
      expect((await send(s.anna.token, 'DELETE', `/series/${created.id}/future-sessions`)).status).toBe(403);
      expect(await ofUser(s.anna.userId, NotificationType.EVENT_CANCELLED)).toEqual([]);
      const after = (await send(s.admin, 'GET', `/seasons/${s.seasonId}/events`)).body as Ev[];
      expect(after.filter((e) => e.seriesId === created.id)).toHaveLength(events.length);
    });
  });
});
