import { AuditLog } from '../src/entities/audit-log.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const slot = (offset: number) => ({ start: `${day(offset)}T16:00:00Z`, end: `${day(offset)}T17:30:00Z` });

describe('season statistics (slice 5, rules 10 to 13)', () => {
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
  async function accept(email: string) {
    const u = await t.newUser(email);
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
    expect(acc.status).toBe(200);
    return { token: acc.body.accessToken as string, userId: u.user.id as string };
  }

  /** Club with T1 and T2 (active seasons around today): a coach and two players of T1, a coach of T2. */
  async function club(email: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    const admin = c.body.accessToken as string;
    const act = await post(admin, '/activities', { name: 'Sport', sportProfile: 'football' });
    const team = async (name: string) => {
      const sq = await post(admin, `/activities/${act.id}/teams`, { name });
      const st = await post(admin, `/teams/${sq.id}/seasons`, { name: 'Now', startDate: day(-60), endDate: day(400) });
      return { teamId: sq.id as string, seasonId: st.id as string };
    };
    const t1 = await team('T1');
    const t2 = await team('T2');
    const withAccount = async (seasonId: string, tag: string, type: 'player' | 'staff', staffRole?: string) => {
      const p = await post(admin, '/people', { name: tag, surname: 'Rossi', birthDate: '1990-01-01', email: `${tag}-${email}` });
      const enrollment = await post(admin, `/seasons/${seasonId}/enrollments`, { personId: p.id, type, ...(staffRole ? { staffRole } : {}) });
      await post(admin, '/invitations', { email: `${tag}-${email}`, role: type, personId: p.id });
      return { ...(await accept(`${tag}-${email}`)), personId: p.id as string, enrollmentId: enrollment.id as string };
    };
    const coach1 = await withAccount(t1.seasonId, 'c1', 'staff', 'coach');
    const coach2 = await withAccount(t2.seasonId, 'c2', 'staff', 'coach');
    const player = await withAccount(t1.seasonId, 'p1', 'player');
    const mate = await withAccount(t1.seasonId, 'p2', 'player');
    for (const x of [t1, t2]) expect((await t.req('POST', `/seasons/${x.seasonId}/active`, { token: admin })).status).toBe(200);
    const event = (offset: number, over: object = {}) => post(admin, `/teams/${t1.teamId}/events`, { type: 'training', ...slot(offset), ...over });
    const match = (offset: number) => event(offset, { type: 'match', opponent: 'Rivals', homeAway: 'home', competition: 'League' });
    const manager = async (tag: string) => {
      await post(admin, '/invitations', { email: `${tag}-${email}`, role: 'manager', scope: 'team', teamId: t1.teamId });
      return accept(`${tag}-${email}`);
    };
    const mark = async (eventId: string, enrollmentId: string, outcome: string) =>
      expect((await send(coach1.token, 'PUT', `/events/${eventId}/attendance/${enrollmentId}`, { outcome })).status).toBe(200);
    return { admin, t1, t2, coach1, coach2, player, mate, event, match, manager, mark };
  }

  const stats = (token: string, seasonId: string) => send(token, 'GET', `/seasons/${seasonId}/statistics`);
  const code = (r: { status: number; body: { code?: string } }) => [r.status, r.body.code];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rowOf = (rows: any[], id: string) => rows.find((r) => r.enrollmentId === id);

  describe('staff', () => {
    it('read one row per player with the counts and the rate, and the team totals', async () => {
      const s = await club('st-01@test.it');
      const e1 = await s.event(-6);
      const e2 = await s.event(-5);
      const e3 = await s.event(-4);
      await s.mark(e1.id, s.player.enrollmentId, 'present');
      await s.mark(e2.id, s.player.enrollmentId, 'late');
      await s.mark(e3.id, s.player.enrollmentId, 'absent');
      await s.mark(e1.id, s.mate.enrollmentId, 'absent_excused');
      await s.mark(e2.id, s.coach1.enrollmentId, 'present');

      const r = await stats(s.coach1.token, s.t1.seasonId);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ view: 'full', teamName: 'T1', seasonName: 'Now', seasonStatus: 'active', mine: null });
      expect(r.body.rows).toHaveLength(2);
      expect(rowOf(r.body.rows, s.player.enrollmentId)).toMatchObject({
        name: 'p1', present: 1, late: 1, absentExcused: 0, absent: 1, injured: 0, attended: 2, rate: 2 / 3, absenceDays: 0, suspendedMatches: 0,
      });
      expect(rowOf(r.body.rows, s.mate.enrollmentId)).toMatchObject({ present: 0, absentExcused: 1, rate: 0 });
      // The coach's own mark is staff attendance: it stays out of the player figures.
      expect(r.body.totals).toMatchObject({ present: 1, late: 1, absentExcused: 1, absent: 1, attended: 2, rate: 0.5 });
    });

    it('see the declared days and the matches missed for a suspension on the row', async () => {
      const s = await club('st-02@test.it');
      await s.match(-10);
      await s.match(-8);
      await s.match(-2);
      expect((await send(s.player.token, 'POST', `/enrollments/${s.player.enrollmentId}/absences`, { startDate: day(-20), endDate: day(-16) })).status).toBe(201);
      expect((await send(s.player.token, 'POST', `/enrollments/${s.player.enrollmentId}/absences`, { startDate: day(-18), endDate: day(-14) })).status).toBe(201);
      const susp = await send(s.coach1.token, 'POST', `/enrollments/${s.player.enrollmentId}/suspensions`, { form: 'matches', startDate: day(-12), matchCount: 2 });
      expect(susp.status).toBe(201);

      const r = await stats(s.coach1.token, s.t1.seasonId);
      // day(-20) to day(-14): the two periods overlap and count once. Two matches served, the third is not covered.
      expect(rowOf(r.body.rows, s.player.enrollmentId)).toMatchObject({ absenceDays: 7, suspendedMatches: 2 });
      expect(r.body.totals).toMatchObject({ absenceDays: 7, suspendedMatches: 2 });
    });

    it('a future match covered by a suspension is not counted as missed yet', async () => {
      const s = await club('st-03@test.it');
      await s.match(4);
      await send(s.coach1.token, 'POST', `/enrollments/${s.player.enrollmentId}/suspensions`, { form: 'matches', startDate: day(0), matchCount: 1 });
      const r = await stats(s.coach1.token, s.t1.seasonId);
      expect(rowOf(r.body.rows, s.player.enrollmentId).suspendedMatches).toBe(0);
    });

    it('see the injured count only, and the injured events stay out of the rate', async () => {
      const s = await club('st-04@test.it');
      const e1 = await s.event(-6);
      const e2 = await s.event(-5);
      const e3 = await s.event(-4);
      await s.mark(e1.id, s.player.enrollmentId, 'present');
      await s.mark(e2.id, s.player.enrollmentId, 'injured');
      await s.mark(e3.id, s.player.enrollmentId, 'injured');
      const r = await stats(s.coach1.token, s.t1.seasonId);
      const row = rowOf(r.body.rows, s.player.enrollmentId);
      expect(row).toMatchObject({ injured: 2, rate: 1 });
      expect(JSON.stringify(row)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(Object.keys(row).sort()).toEqual(
        ['absenceDays', 'absent', 'absentExcused', 'attended', 'disabled', 'enrollmentId', 'injured', 'late', 'name', 'present', 'rate', 'suspendedMatches', 'surname'].sort(),
      );
    });

    it('a correction of the attendance changes the figures at once', async () => {
      const s = await club('st-05@test.it');
      const e1 = await s.event(-3);
      await s.mark(e1.id, s.player.enrollmentId, 'absent');
      expect(rowOf((await stats(s.coach1.token, s.t1.seasonId)).body.rows, s.player.enrollmentId).rate).toBe(0);
      await s.mark(e1.id, s.player.enrollmentId, 'present');
      expect(rowOf((await stats(s.coach1.token, s.t1.seasonId)).body.rows, s.player.enrollmentId).rate).toBe(1);
    });

    it('a player disabled during the season keeps the row for the totals, nameless except for the admin', async () => {
      const s = await club('st-06@test.it');
      const e1 = await s.event(-3);
      await s.mark(e1.id, s.player.enrollmentId, 'present');
      await s.mark(e1.id, s.mate.enrollmentId, 'absent');
      expect((await send(s.admin, 'POST', `/people/${s.player.personId}/disable`)).status).toBe(200);

      const staff = await stats(s.coach1.token, s.t1.seasonId);
      expect(rowOf(staff.body.rows, s.player.enrollmentId)).toMatchObject({ name: null, surname: null, disabled: true, present: 1 });
      expect(staff.body.totals).toMatchObject({ present: 1, absent: 1, rate: 0.5 });
      const admin = await stats(s.admin, s.t1.seasonId);
      expect(rowOf(admin.body.rows, s.player.enrollmentId)).toMatchObject({ name: 'p1', disabled: true });
    });

    it('a staff member of another team is refused', async () => {
      const s = await club('st-07@test.it');
      expect(code(await stats(s.coach2.token, s.t1.seasonId))).toEqual([403, 'PERMISSION_DENIED']);
    });

    it('a closed season stays readable as history', async () => {
      const s = await club('st-08@test.it');
      const e1 = await s.event(-3);
      await s.mark(e1.id, s.player.enrollmentId, 'present');
      expect((await send(s.admin, 'POST', `/seasons/${s.t1.seasonId}/close`)).status).toBe(200);
      const r = await stats(s.coach1.token, s.t1.seasonId);
      expect(r.status).toBe(200);
      expect(r.body.seasonStatus).toBe('closed');
      expect(rowOf(r.body.rows, s.player.enrollmentId).present).toBe(1);
    });

    it('an unknown season is 404', async () => {
      const s = await club('st-09@test.it');
      expect(code(await stats(s.admin, '00000000-0000-4000-8000-000000000000'))).toEqual([404, 'SEASON_NOT_FOUND']);
    });
  });

  describe('admin and managers', () => {
    it('the admin reads every player', async () => {
      const s = await club('st-10@test.it');
      const r = await stats(s.admin, s.t1.seasonId);
      expect(r.body.view).toBe('full');
      expect(r.body.rows).toHaveLength(2);
    });

    it('a manager in scope reads the team totals and no row', async () => {
      const s = await club('st-11@test.it');
      const e1 = await s.event(-3);
      await s.mark(e1.id, s.player.enrollmentId, 'present');
      await s.mark(e1.id, s.mate.enrollmentId, 'injured');
      const m = await s.manager('mg');
      const r = await stats(m.token, s.t1.seasonId);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ view: 'totals', rows: [], mine: null, totals: { present: 1, injured: 1, rate: 1 } });
    });

    it('a manager of another team is refused', async () => {
      const s = await club('st-12@test.it');
      const m = await s.manager('mg');
      expect(code(await stats(m.token, s.t2.seasonId))).toEqual([403, 'PERMISSION_DENIED']);
    });
  });

  describe('players', () => {
    it('read only their own figures, with no totals and no teammate', async () => {
      const s = await club('st-20@test.it');
      const e1 = await s.event(-3);
      await s.mark(e1.id, s.player.enrollmentId, 'present');
      await s.mark(e1.id, s.mate.enrollmentId, 'injured');
      const r = await stats(s.player.token, s.t1.seasonId);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ view: 'own', rows: [], totals: null, mine: { enrollmentId: s.player.enrollmentId, present: 1, injured: 0 } });
      expect(JSON.stringify(r.body)).not.toContain(s.mate.enrollmentId);
    });

    it('see the injured count on their own row', async () => {
      const s = await club('st-21@test.it');
      const e1 = await s.event(-3);
      await s.mark(e1.id, s.player.enrollmentId, 'injured');
      expect((await stats(s.player.token, s.t1.seasonId)).body.mine.injured).toBe(1);
    });

    it('are refused on the statistics of a teammate', async () => {
      const s = await club('st-22@test.it');
      expect(code(await send(s.player.token, 'GET', `/enrollments/${s.mate.enrollmentId}/statistics`))).toEqual([403, 'PERMISSION_DENIED']);
      expect((await send(s.player.token, 'GET', `/enrollments/${s.player.enrollmentId}/statistics`)).status).toBe(200);
    });

    it('staff read the statistics of one player, a coach of another team does not', async () => {
      const s = await club('st-23@test.it');
      const ok = await send(s.coach1.token, 'GET', `/enrollments/${s.player.enrollmentId}/statistics`);
      expect(ok.status).toBe(200);
      expect(ok.body.enrollmentId).toBe(s.player.enrollmentId);
      expect(code(await send(s.coach2.token, 'GET', `/enrollments/${s.player.enrollmentId}/statistics`))).toEqual([403, 'PERMISSION_DENIED']);
    });

    it('list their own seasons, closed ones too', async () => {
      const s = await club('st-25@test.it');
      const e1 = await s.event(-3);
      await s.mark(e1.id, s.player.enrollmentId, 'present');
      expect((await send(s.admin, 'POST', `/seasons/${s.t1.seasonId}/close`)).status).toBe(200);
      const r = await send(s.player.token, 'GET', '/statistics/me');
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(1);
      expect(r.body[0]).toMatchObject({ seasonId: s.t1.seasonId, teamName: 'T1', seasonStatus: 'closed', mine: { present: 1 } });
    });

    it('a person with no player enrollment has an empty list', async () => {
      const s = await club('st-26@test.it');
      expect((await send(s.coach1.token, 'GET', '/statistics/me')).body).toEqual([]);
    });
  });

  describe('audit', () => {
    it('every read is audited with the season and the view, never the figures', async () => {
      const s = await club('st-30@test.it');
      const e1 = await s.event(-3);
      await s.mark(e1.id, s.player.enrollmentId, 'injured');
      await stats(s.coach1.token, s.t1.seasonId);
      await stats(s.player.token, s.t1.seasonId);
      await send(s.coach1.token, 'GET', `/enrollments/${s.player.enrollmentId}/statistics`);
      const log = await t.orm.em.fork().find(AuditLog, { action: 'statistics_read' as never }, { filters: false, orderBy: { createdAt: 'asc' } });
      const mine = log.filter((l) => (l.meta as { seasonId?: string } | null)?.seasonId === s.t1.seasonId);
      expect(mine.map((l) => l.meta)).toEqual([
        { seasonId: s.t1.seasonId, view: 'full' },
        { seasonId: s.t1.seasonId, view: 'own' },
        { seasonId: s.t1.seasonId, view: 'full', enrollmentId: s.player.enrollmentId },
      ]);
    });
  });
});
