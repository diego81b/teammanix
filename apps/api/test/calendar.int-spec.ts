import { Enrollment } from '../src/entities/enrollment.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment, createTeams } from './helpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
/** One hour event starting `days` from now. Seasons below span from 30 days ago to a year ahead, so every event is inside. */
const inDays = (days: number, extra: object = {}) => {
  const start = new Date(Date.now() + days * DAY_MS);
  return { type: 'training', start: start.toISOString(), end: new Date(start.getTime() + 60 * 60 * 1000).toISOString(), ...extra };
};

describe('calendar: team and personal views', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
    const em = t.orm.em.fork();
    em.create(SportProfile, { code: 'football', positions: ['goalkeeper'], modulesAvailable: ['attendances'] } as never);
    await em.flush();
  });
  afterAll(async () => {
    await t?.close();
  });

  const get = (token: string, url: string) => t.req('GET', url, { token });
  const post = async (token: string, url: string, body: object) => {
    const r = await t.req('POST', url, { token, body });
    expect(r.status).toBe(201);
    return r.body;
  };

  async function accept(email: string) {
    const u = await t.newUser(email);
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
    expect(acc.status).toBe(200);
    return acc.body.accessToken as string;
  }

  /**
   * Club with teams T1 and T2 (active seasons from 30 days ago to a year ahead), a coach per team and a player of T1.
   * `joinT2` also enrolls the player in T2.
   */
  async function club(email: string, joinT2 = false) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    const admin = c.body.accessToken as string;
    const struct = await createTeams(t.req, admin, { sportProfile: 'football', section: 'Football' });
    const team = async (name: string) => {
      const sq = await struct.team(name);
      const st = await post(admin, `/teams/${sq.id}/seasons`, { name: '2026/27', startDate: ymd(-30), endDate: ymd(365) });
      return { teamId: sq.id as string, seasonId: st.id as string };
    };
    const t1 = await team('T1');
    const t2 = await team('T2');
    const member = async (seasonId: string, addr: string, type: 'staff' | 'player') => {
      const p = await post(admin, '/people', { name: 'Carlo', surname: 'Neri', birthDate: '1985-02-03', email: addr });
      const enrollment = await post(admin, `/seasons/${seasonId}/enrollments`, { personId: p.id, type, ...(type === 'staff' ? { staffRole: 'coach' } : {}) });
      await post(admin, '/invitations', { email: addr, role: type, personId: p.id });
      return { token: await accept(addr), personId: p.id as string, enrollmentId: enrollment.id as string };
    };
    const coach1 = await member(t1.seasonId, `c1-${email}`, 'staff');
    const coach2 = await member(t2.seasonId, `c2-${email}`, 'staff');
    const player = await member(t1.seasonId, `p1-${email}`, 'player');
    let playerT2: { id: string } | null = null;
    if (joinT2) playerT2 = await post(admin, `/seasons/${t2.seasonId}/enrollments`, { personId: player.personId, type: 'player' });
    for (const x of [t1, t2]) expect((await t.req('POST', `/seasons/${x.seasonId}/active`, { token: admin })).status).toBe(200);
    return { admin, t1, t2, coach1, coach2, player, playerT2 };
  }

  const plan = async (token: string, teamId: string, days: number, extra: object = {}) => post(token, `/teams/${teamId}/events`, inDays(days, extra));
  const ids = (rows: { id: string }[]) => rows.map((e) => e.id);

  describe('personal calendar', () => {
    it('a player enrolled in two teams sees the events of both together, in order, with team and season', async () => {
      const s = await club('cal-1@test.it', true);
      const b = await plan(s.coach2.token, s.t2.teamId, 5);
      const a = await plan(s.coach1.token, s.t1.teamId, 3);
      const c = await plan(s.coach1.token, s.t1.teamId, 9);
      const r = await get(s.player.token, '/calendar/me');
      expect(r.status).toBe(200);
      expect(ids(r.body)).toEqual([a.id, b.id, c.id]);
      expect(r.body[0]).toMatchObject({ teamId: s.t1.teamId, teamName: 'T1', seasonId: s.t1.seasonId, seasonName: '2026/27', seasonStatus: 'active' });
      expect(r.body[1]).toMatchObject({ teamId: s.t2.teamId, teamName: 'T2' });
    });

    it('does not list the events of another team of the same club, and the season is refused by id', async () => {
      const s = await club('cal-2@test.it');
      const mine = await plan(s.coach1.token, s.t1.teamId, 3);
      const other = await plan(s.coach2.token, s.t2.teamId, 4);
      const r = await get(s.player.token, '/calendar/me');
      expect(ids(r.body)).toEqual([mine.id]);
      const direct = await get(s.player.token, `/seasons/${s.t2.seasonId}/events`);
      expect([direct.status, direct.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      expect(ids(r.body)).not.toContain(other.id);
    });

    it('a closed season stays readable in the history and cannot be changed', async () => {
      const s = await club('cal-3@test.it');
      const past = await plan(s.coach1.token, s.t1.teamId, -5);
      expect((await t.req('POST', `/seasons/${s.t1.seasonId}/close`, { token: s.admin })).status).toBe(200);
      const r = await get(s.player.token, '/calendar/me');
      expect(ids(r.body)).toEqual([past.id]);
      expect(r.body[0].seasonStatus).toBe('closed');
      const edit = await t.req('PATCH', `/events/${past.id}`, { token: s.player.token, body: { note: 'x' } });
      expect([edit.status, edit.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      const admin = await t.req('PATCH', `/events/${past.id}`, { token: s.admin, body: { note: 'x' } });
      expect([admin.status, admin.body.code]).toEqual([409, 'SEASON_CLOSED']);
    });

    it('an enrollment closed on a day hides the later events of that team and keeps the earlier ones', async () => {
      const s = await club('cal-4@test.it', true);
      const before = await plan(s.coach1.token, s.t1.teamId, 3);
      const after = await plan(s.coach1.token, s.t1.teamId, 20);
      const other = await plan(s.coach2.token, s.t2.teamId, 21);
      const em = t.orm.em.fork();
      await em.nativeUpdate(Enrollment, { id: s.player.enrollmentId }, { endedAt: ymd(10) }, { filters: false });
      const r = await get(s.player.token, '/calendar/me');
      expect(ids(r.body)).toEqual([before.id, other.id]);
      expect(ids(r.body)).not.toContain(after.id);
    });

    it('cancelled and postponed events stay in the calendar with their status', async () => {
      const s = await club('cal-5@test.it');
      const x = await plan(s.coach1.token, s.t1.teamId, 3);
      const y = await plan(s.coach1.token, s.t1.teamId, 4);
      expect((await t.req('POST', `/events/${x.id}/cancel`, { token: s.coach1.token })).status).toBe(200);
      expect((await t.req('POST', `/events/${y.id}/postpone`, { token: s.coach1.token })).status).toBe(200);
      const r = await get(s.player.token, '/calendar/me');
      expect(r.body.map((e: { status: string }) => e.status)).toEqual(['cancelled', 'postponed']);
    });

    it('an account without a person record, such as an admin who is not enrolled, has an empty personal calendar', async () => {
      const s = await club('cal-6@test.it');
      await plan(s.coach1.token, s.t1.teamId, 3);
      const r = await get(s.admin, '/calendar/me');
      expect([r.status, r.body]).toEqual([200, []]);
    });

    it('a person enrolled as staff in three teams at once sees the events of all three, in order', async () => {
      const s = await club('cal-staff3@test.it');
      const third = await post(s.admin, '/teams', { name: 'T3', sportProfile: 'football' });
      const seasonT3 = await post(s.admin, `/teams/${third.id}/seasons`, { name: '2026/27', startDate: ymd(-30), endDate: ymd(365) });
      expect((await t.req('POST', `/seasons/${seasonT3.id}/active`, { token: s.admin })).status).toBe(200);
      const addr = 'trainer-cal-staff3@test.it';
      const trainer = await post(s.admin, '/people', { name: 'Gino', surname: 'Bianchi', birthDate: '1980-01-02', email: addr });
      await post(s.admin, '/invitations', { email: addr, role: 'staff', personId: trainer.id });
      const token = await accept(addr);
      expect(ids((await get(token, '/calendar/me')).body)).toEqual([]);

      const bulk = await t.req('POST', `/people/${trainer.id}/staff-enrollments`, { token: s.admin, body: { teamIds: [s.t1.teamId, s.t2.teamId, third.id], staffRole: 'trainer' } });
      expect([bulk.status, bulk.body.length]).toEqual([201, 3]);

      const c = await plan(s.admin, third.id, 7);
      const b = await plan(s.coach2.token, s.t2.teamId, 5);
      const a = await plan(s.coach1.token, s.t1.teamId, 3);
      const r = await get(token, '/calendar/me');
      expect(ids(r.body)).toEqual([a.id, b.id, c.id]);
      expect(r.body.map((e: { teamName: string }) => e.teamName)).toEqual(['T1', 'T2', 'T3']);
    });

    it('never mixes clubs: a player sees only the events of their own club', async () => {
      const a = await club('cal-7a@test.it');
      const b = await club('cal-7b@test.it');
      const ea = await plan(a.coach1.token, a.t1.teamId, 3);
      const eb = await plan(b.coach1.token, b.t1.teamId, 3);
      expect(ids((await get(a.player.token, '/calendar/me')).body)).toEqual([ea.id]);
      expect(ids((await get(b.player.token, '/calendar/me')).body)).toEqual([eb.id]);
    });
  });

  describe('calendars a person can open', () => {
    it('lists the seasons the person reads: enrolled ones for staff and players, every active one for the admin', async () => {
      const s = await club('cal-8@test.it');
      const seasons = async (token: string) => (await get(token, '/calendar/teams')).body.map((x: { seasonId: string }) => x.seasonId);
      expect(await seasons(s.player.token)).toEqual([s.t1.seasonId]);
      expect(await seasons(s.coach2.token)).toEqual([s.t2.seasonId]);
      expect((await seasons(s.admin)).sort()).toEqual([s.t1.seasonId, s.t2.seasonId].sort());
      const row = (await get(s.coach1.token, '/calendar/teams')).body[0];
      expect(row).toMatchObject({ seasonId: s.t1.seasonId, seasonName: '2026/27', seasonStatus: 'active', teamId: s.t1.teamId, teamName: 'T1', sectionName: 'Football' });
    });

    it('keeps a closed season in the list for the people enrolled in it', async () => {
      const s = await club('cal-9@test.it');
      expect((await t.req('POST', `/seasons/${s.t1.seasonId}/close`, { token: s.admin })).status).toBe(200);
      const rows = (await get(s.player.token, '/calendar/teams')).body;
      expect(rows.map((x: { seasonStatus: string }) => x.seasonStatus)).toEqual(['closed']);
      // The admin does not need a closed season in the picker: it is reached from the season page.
      const admin = (await get(s.admin, '/calendar/teams')).body.map((x: { seasonId: string }) => x.seasonId);
      expect(admin).toEqual([s.t2.seasonId]);
    });
  });

  describe('next event for the home', () => {
    it('a player gets the soonest upcoming event across all their teams, skipping past and cancelled ones', async () => {
      const s = await club('cal-10@test.it', true);
      await plan(s.coach1.token, s.t1.teamId, -2);
      const cancelled = await plan(s.coach1.token, s.t1.teamId, 1);
      expect((await t.req('POST', `/events/${cancelled.id}/cancel`, { token: s.coach1.token })).status).toBe(200);
      const soon = await plan(s.coach2.token, s.t2.teamId, 2);
      await plan(s.coach1.token, s.t1.teamId, 6);
      const r = await get(s.player.token, '/calendar/next');
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ id: soon.id, teamName: 'T2' });
    });

    it('a coach gets the next event of their team only, the admin the next of the whole club', async () => {
      const s = await club('cal-11@test.it');
      const mine = await plan(s.coach1.token, s.t1.teamId, 8);
      const other = await plan(s.coach2.token, s.t2.teamId, 2);
      expect((await get(s.coach1.token, '/calendar/next')).body.id).toBe(mine.id);
      expect((await get(s.coach2.token, '/calendar/next')).body.id).toBe(other.id);
      expect((await get(s.admin, '/calendar/next')).body.id).toBe(other.id);
    });

    it('an event that has started but not ended is still the next one', async () => {
      const s = await club('cal-12@test.it');
      const now = Date.now();
      const running = await post(s.coach1.token, `/teams/${s.t1.teamId}/events`, {
        type: 'training',
        start: new Date(now - 30 * 60 * 1000).toISOString(),
        end: new Date(now + 30 * 60 * 1000).toISOString(),
      });
      await plan(s.coach1.token, s.t1.teamId, 2);
      expect((await get(s.player.token, '/calendar/next')).body.id).toBe(running.id);
    });

    it('answers null when nothing is coming, and does not look at closed seasons or other teams', async () => {
      const s = await club('cal-13@test.it');
      expect((await get(s.player.token, '/calendar/next')).body).toBeNull();
      await plan(s.coach2.token, s.t2.teamId, 2);
      expect((await get(s.player.token, '/calendar/next')).body).toBeNull();
      const future = await plan(s.coach1.token, s.t1.teamId, 4);
      expect((await get(s.player.token, '/calendar/next')).body.id).toBe(future.id);
      expect((await t.req('POST', `/seasons/${s.t1.seasonId}/close`, { token: s.admin })).status).toBe(200);
      expect((await get(s.player.token, '/calendar/next')).body).toBeNull();
    });
  });
});
