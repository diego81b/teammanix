import { AuditLog } from '../src/entities/audit-log.entity';
import { Suspension } from '../src/entities/suspension.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment, createTeams, roleId } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const slot = (offset: number) => ({ start: `${day(offset)}T16:00:00Z`, end: `${day(offset)}T17:30:00Z` });

describe('suspensions (rule 13)', () => {
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

  /** Club with T1 and T2 (active seasons around today): a coach, an assistant and two players of T1, a coach of T2. */
  async function club(email: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    const admin = c.body.accessToken as string;
    const struct = await createTeams(t.req, admin, { sportProfile: 'football' });
    const team = async (name: string) => {
      const sq = await struct.team(name);
      const st = await post(admin, `/teams/${sq.id}/seasons`, { name: 'Now', startDate: day(-60), endDate: day(400) });
      return { teamId: sq.id as string, seasonId: st.id as string };
    };
    const t1 = await team('T1');
    const t2 = await team('T2');
    const person = (tag: string) => post(admin, '/people', { name: tag, surname: 'Rossi', birthDate: '1990-01-01', email: `${tag}-${email}` });
    const enroll = async (seasonId: string, personId: string, type: 'player' | 'staff', staffRole?: string) =>
      post(admin, `/seasons/${seasonId}/enrollments`, { personId, type, ...(staffRole ? { staffRoleId: await roleId(t.req, admin, staffRole) } : {}) });
    const withAccount = async (seasonId: string, tag: string, type: 'player' | 'staff', staffRole?: string) => {
      const p = await person(tag);
      const enrollment = await enroll(seasonId, p.id, type, staffRole);
      await post(admin, '/invitations', { email: `${tag}-${email}`, role: type, personId: p.id });
      if (type === 'player') await post(admin, `/people/${p.id}/certificates`, { type: 'competitive', issueDate: day(-10), expiryDate: day(365) });
      return { ...(await accept(`${tag}-${email}`)), personId: p.id as string, enrollmentId: enrollment.id as string };
    };
    const coach1 = await withAccount(t1.seasonId, 'c1', 'staff', 'coach');
    const assistant = await withAccount(t1.seasonId, 'as', 'staff', 'assistant_coach');
    const coach2 = await withAccount(t2.seasonId, 'c2', 'staff', 'coach');
    const player = await withAccount(t1.seasonId, 'p1', 'player');
    const mate = await withAccount(t1.seasonId, 'p2', 'player');
    for (const x of [t1, t2]) expect((await t.req('POST', `/seasons/${x.seasonId}/active`, { token: admin })).status).toBe(200);
    const event = (teamId: string, offset: number, over: object = {}) => post(admin, `/teams/${teamId}/events`, { type: 'training', ...slot(offset), ...over });
    const match = (teamId: string, offset: number, over: object = {}) =>
      event(teamId, offset, { type: 'match', opponent: 'Rivals', homeAway: 'home', competition: 'League', ...over });
    return { admin, t1, t2, coach1, assistant, coach2, player, mate, event, match, enroll, person, withAccount };
  }

  const byMatches = (matchCount: number, extra: object = {}) => ({ form: 'matches', startDate: day(-30), matchCount, ...extra });
  const byPeriod = (from: number, to: number) => ({ form: 'period', startDate: day(from), endDate: day(to) });
  const suspend = (token: string, enrollmentId: string, body: object) => send(token, 'POST', `/enrollments/${enrollmentId}/suspensions`, body);
  const lists = async (token: string, eventId: string) => {
    const r = await send(token, 'GET', `/events/${eventId}/callups`);
    expect(r.status).toBe(200);
    return r.body;
  };
  const callUp = (token: string, eventId: string, enrollmentId: string, extra: object = {}) =>
    send(token, 'POST', `/events/${eventId}/callups`, { enrollmentId, ...extra });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (rows: any[], id: string) => rows.find((r) => r.enrollmentId === id);
  const code = (r: { status: number; body: { code?: string } }) => [r.status, r.body.code];
  const trail = (action: string, entityId: string) => t.orm.em.fork().find(AuditLog, { action: action as never, entityId }, { filters: false });

  describe('who records them', () => {
    it('a coach records a suspension by matches and by period, and every change is audited', async () => {
      const s = await club('su-1@test.it');
      const made = await suspend(s.coach1.token, s.player.enrollmentId, byMatches(2, { competitions: ['  League '] }));
      expect(made.status).toBe(201);
      expect(made.body).toMatchObject({
        enrollmentId: s.player.enrollmentId,
        form: 'matches',
        matchCount: 2,
        endDate: null,
        competitions: ['League'],
        originEventId: null,
        covered: [],
        served: 0,
        remaining: 2,
        completed: false,
      });
      const period = await suspend(s.coach1.token, s.mate.enrollmentId, byPeriod(3, 9));
      expect(period.status).toBe(201);
      expect(period.body).toMatchObject({ form: 'period', startDate: day(3), endDate: day(9), matchCount: null, competitions: [] });

      const edited = await send(s.coach1.token, 'PATCH', `/suspensions/${made.body.id}`, byMatches(3));
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ matchCount: 3, competitions: [] });
      expect((await send(s.coach1.token, 'DELETE', `/suspensions/${made.body.id}`)).status).toBe(204);

      expect(await trail('suspension_created', made.body.id)).toHaveLength(1);
      expect(await trail('suspension_modified', made.body.id)).toHaveLength(1);
      expect(await trail('suspension_cancelled', made.body.id)).toHaveLength(1);
      expect(await t.orm.em.fork().count(Suspension, { id: made.body.id }, { filters: false })).toBe(0);
    });

    it('the admin records one too', async () => {
      const s = await club('su-2@test.it');
      expect((await suspend(s.admin, s.player.enrollmentId, byMatches(1))).status).toBe(201);
    });

    it('a staff member can be suspended', async () => {
      const s = await club('su-3@test.it');
      expect((await suspend(s.coach1.token, s.assistant.enrollmentId, byMatches(1))).status).toBe(201);
    });

    it('refuses who has no suspensions policy: assistant, player, teammate, coach of another team', async () => {
      const s = await club('su-4@test.it');
      for (const who of [s.assistant, s.player, s.mate, s.coach2]) {
        expect(code(await suspend(who.token, s.player.enrollmentId === who.enrollmentId ? s.mate.enrollmentId : s.player.enrollmentId, byMatches(1)))).toEqual([403, 'PERMISSION_DENIED']);
      }
    });

    it('nobody records, edits or removes a suspension on their own enrollment, even with the policy', async () => {
      const s = await club('su-5@test.it');
      expect(code(await suspend(s.coach1.token, s.coach1.enrollmentId, byMatches(1)))).toEqual([403, 'PERMISSION_DENIED']);
      const made = await suspend(s.admin, s.coach1.enrollmentId, byMatches(1));
      expect(made.status).toBe(201);
      expect(code(await send(s.coach1.token, 'PATCH', `/suspensions/${made.body.id}`, byMatches(5)))).toEqual([403, 'PERMISSION_DENIED']);
      expect(code(await send(s.coach1.token, 'DELETE', `/suspensions/${made.body.id}`))).toEqual([403, 'PERMISSION_DENIED']);
    });

    it('refuses edit and delete to who has no policy', async () => {
      const s = await club('su-6@test.it');
      const made = await suspend(s.coach1.token, s.player.enrollmentId, byMatches(1));
      for (const who of [s.player, s.mate, s.assistant, s.coach2]) {
        expect(code(await send(who.token, 'PATCH', `/suspensions/${made.body.id}`, byMatches(5)))).toEqual([403, 'PERMISSION_DENIED']);
        expect(code(await send(who.token, 'DELETE', `/suspensions/${made.body.id}`))).toEqual([403, 'PERMISSION_DENIED']);
      }
    });

    it('a club never reaches the records of another', async () => {
      const a = await club('su-7a@test.it');
      const b = await club('su-7b@test.it');
      const made = await suspend(a.coach1.token, a.player.enrollmentId, byMatches(1));
      expect(code(await suspend(b.admin, a.player.enrollmentId, byMatches(1)))).toEqual([404, 'ENROLLMENT_NOT_FOUND']);
      expect(code(await send(b.admin, 'PATCH', `/suspensions/${made.body.id}`, byMatches(2)))).toEqual([404, 'SUSPENSION_NOT_FOUND']);
      expect(code(await send(b.admin, 'DELETE', `/suspensions/${made.body.id}`))).toEqual([404, 'SUSPENSION_NOT_FOUND']);
      expect(code(await send(b.admin, 'GET', `/enrollments/${a.player.enrollmentId}/suspensions`))).toEqual([404, 'ENROLLMENT_NOT_FOUND']);
      expect(code(await send(b.admin, 'GET', `/seasons/${a.t1.seasonId}/suspensions`))).toEqual([404, 'SEASON_NOT_FOUND']);
    });

    it('a closed season is read only', async () => {
      const s = await club('su-8@test.it');
      const made = await suspend(s.coach1.token, s.player.enrollmentId, byMatches(1));
      expect((await send(s.admin, 'POST', `/seasons/${s.t1.seasonId}/close`)).status).toBe(200);
      expect(code(await suspend(s.admin, s.mate.enrollmentId, byMatches(1)))).toEqual([409, 'SEASON_CLOSED']);
      expect(code(await send(s.admin, 'PATCH', `/suspensions/${made.body.id}`, byMatches(2)))).toEqual([409, 'SEASON_CLOSED']);
      expect(code(await send(s.admin, 'DELETE', `/suspensions/${made.body.id}`))).toEqual([409, 'SEASON_CLOSED']);
    });

    it('events-access tells the screen who can suspend: coach and admin yes, assistant, player and other team no, nobody in a closed season', async () => {
      const s = await club('su-9@test.it');
      const can = async (token: string, seasonId = s.t1.seasonId) => (await send(token, 'GET', `/seasons/${seasonId}/events-access`)).body.canSuspend;
      expect(await can(s.coach1.token)).toBe(true);
      expect(await can(s.admin)).toBe(true);
      expect(await can(s.assistant.token)).toBe(false);
      expect(await can(s.player.token)).toBe(false);
      expect(await can(s.coach2.token)).toBe(false);
      expect((await send(s.admin, 'POST', `/seasons/${s.t1.seasonId}/close`)).status).toBe(200);
      expect(await can(s.admin)).toBe(false);
    });
  });

  describe('validation', () => {
    it.each([
      ['a matches form with an end date', { ...byMatches(2), endDate: day(5) }, 'INVALID_DATA'],
      ['no match count', { form: 'matches', startDate: day(1) }, 'INVALID_DATA'],
      ['zero matches', byMatches(0), 'INVALID_DATA'],
      ['half a match', byMatches(1.5), 'INVALID_DATA'],
      ['a period with no end', { form: 'period', startDate: day(1) }, 'INVALID_DATA'],
      ['a period ending before it starts', byPeriod(9, 3), 'INVALID_DATA'],
      ['a period with a match count', { ...byPeriod(3, 9), matchCount: 2 }, 'INVALID_DATA'],
      ['a period with competitions', { ...byPeriod(3, 9), competitions: ['League'] }, 'INVALID_DATA'],
      ['a day that does not exist', byMatches(1, { startDate: '2026-02-30' }), 'INVALID_DATA'],
      ['an unknown form', { form: 'forever', startDate: day(1) }, 'INVALID_DATA'],
      ['an unknown field', { ...byMatches(1), reason: 'insults' }, 'INVALID_DATA'],
      ['a start before the season', byMatches(1, { startDate: day(-61) }), 'SUSPENSION_OUTSIDE_SEASON'],
      ['an end after the season', byPeriod(3, 401), 'SUSPENSION_OUTSIDE_SEASON'],
    ])('refuses %s', async (_name, body, expected) => {
      const s = await club(`su-v-${Math.random().toString(36).slice(2, 8)}@test.it`);
      expect(code(await suspend(s.coach1.token, s.player.enrollmentId, body))).toEqual([400, expected]);
    });

    it('does not restrict competitions to names already used: a carried over suspension names them before any event exists', async () => {
      const s = await club('su-v2@test.it');
      const r = await suspend(s.coach1.token, s.player.enrollmentId, byMatches(1, { competitions: ['Coppa Italia', 'coppa  italia'] }));
      expect(r.status).toBe(201);
      expect(r.body.competitions).toEqual(['Coppa Italia']);
    });

    it('the competition names already used by the events of the season are suggested', async () => {
      const s = await club('su-v3@test.it');
      await s.match(s.t1.teamId, 5, { competition: 'League' });
      await s.match(s.t1.teamId, 6, { competition: 'Cup' });
      const r = await send(s.coach1.token, 'GET', `/seasons/${s.t1.seasonId}/competitions`);
      expect([r.status, r.body]).toEqual([200, ['Cup', 'League']]);
    });
  });

  describe('born from a match', () => {
    it('the match becomes the origin and the count starts from the next one', async () => {
      const s = await club('su-o1@test.it');
      const m1 = await s.match(s.t1.teamId, 5);
      const m2 = await s.match(s.t1.teamId, 12);
      const m3 = await s.match(s.t1.teamId, 19);
      const made = await suspend(s.coach1.token, s.player.enrollmentId, { form: 'matches', matchCount: 1, originEventId: m1.id });
      expect(made.status).toBe(201);
      expect(made.body).toMatchObject({ originEventId: m1.id, startDate: day(5) });
      expect(made.body.covered.map((m: { eventId: string }) => m.eventId)).toEqual([m2.id]);

      expect(row((await lists(s.coach1.token, m1.id)).callable, s.player.enrollmentId)).toBeDefined();
      expect(row((await lists(s.coach1.token, m2.id)).notCallable, s.player.enrollmentId)).toBeDefined();
      expect(row((await lists(s.coach1.token, m3.id)).callable, s.player.enrollmentId)).toBeDefined();
    });

    it('the origin must be a match of the same season', async () => {
      const s = await club('su-o2@test.it');
      const training = await s.event(s.t1.teamId, 5);
      const other = await s.match(s.t2.teamId, 5);
      for (const originEventId of [training.id, other.id, '00000000-0000-4000-8000-000000000000']) {
        expect(code(await suspend(s.coach1.token, s.player.enrollmentId, { form: 'matches', matchCount: 1, originEventId }))).toEqual([400, 'INVALID_ORIGIN']);
      }
    });

    it('a period has no origin', async () => {
      const s = await club('su-o3@test.it');
      const m = await s.match(s.t1.teamId, 5);
      expect(code(await suspend(s.coach1.token, s.player.enrollmentId, { ...byPeriod(3, 9), originEventId: m.id }))).toEqual([400, 'INVALID_DATA']);
    });
  });

  describe('effect on the call-up of matches', () => {
    it('a suspension of 2 matches blocks those two matches and not the third, with the count in the reason', async () => {
      const s = await club('su-c1@test.it');
      const [m1, m2, m3] = [await s.match(s.t1.teamId, 5), await s.match(s.t1.teamId, 12), await s.match(s.t1.teamId, 19)];
      await suspend(s.coach1.token, s.player.enrollmentId, byMatches(2));

      const l1 = await lists(s.coach1.token, m1.id);
      expect(row(l1.callable, s.player.enrollmentId)).toBeUndefined();
      expect(row(l1.notCallable, s.player.enrollmentId).reasons).toEqual([{ code: 'suspended', severity: 'hard', match: 1, total: 2 }]);
      expect(row((await lists(s.coach1.token, m2.id)).notCallable, s.player.enrollmentId).reasons).toEqual([{ code: 'suspended', severity: 'hard', match: 2, total: 2 }]);
      const l3 = await lists(s.coach1.token, m3.id);
      expect(row(l3.callable, s.player.enrollmentId)).toBeDefined();
      expect(row(l3.callable, s.mate.enrollmentId)).toBeDefined();
    });

    it('the coach cannot call the player up for a covered match, not even with a confirmation, and cannot undo it', async () => {
      const s = await club('su-c2@test.it');
      const m1 = await s.match(s.t1.teamId, 5);
      await suspend(s.coach1.token, s.player.enrollmentId, byMatches(1));
      const refused = await callUp(s.coach1.token, m1.id, s.player.enrollmentId);
      expect([refused.status, refused.body.code, refused.body.reasons]).toEqual([409, 'ENROLLMENT_NOT_CALLABLE', ['suspended']]);
      expect((await callUp(s.coach1.token, m1.id, s.player.enrollmentId, { confirm: true })).status).toBe(409);
      expect((await callUp(s.admin, m1.id, s.player.enrollmentId, { confirm: true })).status).toBe(409);
    });

    it('a declared absence on a covered match does not open the suspension: the confirmation is still refused', async () => {
      const s = await club('su-c2b@test.it');
      const m1 = await s.match(s.t1.teamId, 5);
      const train = await s.event(s.t1.teamId, 5);
      await suspend(s.coach1.token, s.player.enrollmentId, byMatches(1));
      const made = await send(s.player.token, 'POST', `/enrollments/${s.player.enrollmentId}/absences`, { startDate: day(3), endDate: day(8) });
      expect(made.status).toBe(201);
      for (const extra of [{}, { confirm: true }]) {
        const refused = await callUp(s.coach1.token, m1.id, s.player.enrollmentId, extra);
        expect([refused.status, refused.body.code, refused.body.reasons]).toEqual([409, 'ENROLLMENT_NOT_CALLABLE', ['suspended']]);
      }
      // A training is not covered by the suspension: the absence alone asks for the confirmation.
      const needs = await callUp(s.coach1.token, train.id, s.player.enrollmentId);
      expect([needs.status, needs.body.code]).toEqual([409, 'CALLUP_CONFIRMATION_REQUIRED']);
      expect((await callUp(s.coach1.token, train.id, s.player.enrollmentId, { confirm: true })).status).toBe(201);
    });

    it('trainings stay open to the suspended player, on the same days too', async () => {
      const s = await club('su-c3@test.it');
      await s.match(s.t1.teamId, 5);
      const training = await s.event(s.t1.teamId, 5);
      await suspend(s.coach1.token, s.player.enrollmentId, byMatches(1));
      expect(row((await lists(s.coach1.token, training.id)).callable, s.player.enrollmentId)).toBeDefined();
      expect((await callUp(s.coach1.token, training.id, s.player.enrollmentId)).status).toBe(201);
    });

    it('once the covered matches are played the suspension is complete and the player is callable again', async () => {
      const s = await club('su-c4@test.it');
      const [m1, m2, m3] = [await s.match(s.t1.teamId, -14), await s.match(s.t1.teamId, -7), await s.match(s.t1.teamId, 5)];
      const made = await suspend(s.coach1.token, s.player.enrollmentId, byMatches(2));
      expect(made.body).toMatchObject({ served: 2, remaining: 0, completed: true });
      expect(made.body.covered.map((m: { eventId: string; served: boolean }) => [m.eventId, m.served])).toEqual([[m1.id, true], [m2.id, true]]);
      const l = await lists(s.coach1.token, m3.id);
      expect(row(l.callable, s.player.enrollmentId)).toBeDefined();
      expect((await callUp(s.coach1.token, m3.id, s.player.enrollmentId)).status).toBe(201);
    });

    it('one match played and one ahead: the count says 1 of 2 served', async () => {
      const s = await club('su-c5@test.it');
      await s.match(s.t1.teamId, -7);
      await s.match(s.t1.teamId, 5);
      const made = await suspend(s.coach1.token, s.player.enrollmentId, byMatches(2));
      expect(made.body).toMatchObject({ served: 1, remaining: 1, completed: false });
    });

    it('a postponed match does not count and the next one is covered instead; rescheduled later, the count follows the calendar', async () => {
      const s = await club('su-c6@test.it');
      const [m1, m2, m3] = [await s.match(s.t1.teamId, 5), await s.match(s.t1.teamId, 12), await s.match(s.t1.teamId, 19)];
      await suspend(s.coach1.token, s.player.enrollmentId, byMatches(1));
      expect(row((await lists(s.coach1.token, m1.id)).notCallable, s.player.enrollmentId)).toBeDefined();

      expect((await send(s.coach1.token, 'POST', `/events/${m1.id}/postpone`)).status).toBe(200);
      expect(row((await lists(s.coach1.token, m1.id)).notCallable, s.player.enrollmentId)).toBeUndefined();
      expect(row((await lists(s.coach1.token, m2.id)).notCallable, s.player.enrollmentId).reasons[0]).toMatchObject({ code: 'suspended', match: 1, total: 1 });
      expect(row((await lists(s.coach1.token, m3.id)).callable, s.player.enrollmentId)).toBeDefined();

      // Played in the new date, after the second match: the second is now the first one to count and stays covered.
      expect((await send(s.coach1.token, 'PATCH', `/events/${m1.id}`, slot(30))).status).toBe(200);
      expect(row((await lists(s.coach1.token, m1.id)).callable, s.player.enrollmentId)).toBeDefined();
      expect(row((await lists(s.coach1.token, m2.id)).notCallable, s.player.enrollmentId)).toBeDefined();
    });

    it('a cancelled match does not count', async () => {
      const s = await club('su-c7@test.it');
      const [m1, m2] = [await s.match(s.t1.teamId, 5), await s.match(s.t1.teamId, 12)];
      await suspend(s.coach1.token, s.player.enrollmentId, byMatches(1));
      expect((await send(s.coach1.token, 'POST', `/events/${m1.id}/cancel`)).status).toBe(200);
      expect(row((await lists(s.coach1.token, m2.id)).notCallable, s.player.enrollmentId)).toBeDefined();
    });

    it('with competitions chosen only their matches count; with none, every match does', async () => {
      const s = await club('su-c8@test.it');
      const league = await s.match(s.t1.teamId, 5, { competition: 'League' });
      const cup = await s.match(s.t1.teamId, 12, { competition: 'Cup' });
      const none = await s.match(s.t1.teamId, 19, { competition: undefined });
      await suspend(s.coach1.token, s.player.enrollmentId, byMatches(1, { competitions: ['cup'] }));
      await suspend(s.coach1.token, s.mate.enrollmentId, byMatches(1));
      const at = async (id: string) => lists(s.coach1.token, id);
      expect(row((await at(league.id)).callable, s.player.enrollmentId)).toBeDefined();
      expect(row((await at(cup.id)).notCallable, s.player.enrollmentId)).toBeDefined();
      expect(row((await at(none.id)).callable, s.player.enrollmentId)).toBeDefined();
      expect(row((await at(league.id)).notCallable, s.mate.enrollmentId)).toBeDefined();
    });

    it('a period covers every match in it, any competition, and the label carries the end day', async () => {
      const s = await club('su-c9@test.it');
      const before = await s.match(s.t1.teamId, 2);
      const inside = await s.match(s.t1.teamId, 8, { competition: 'Cup' });
      const after = await s.match(s.t1.teamId, 20);
      await suspend(s.coach1.token, s.player.enrollmentId, byPeriod(3, 10));
      expect(row((await lists(s.coach1.token, before.id)).callable, s.player.enrollmentId)).toBeDefined();
      expect(row((await lists(s.coach1.token, inside.id)).notCallable, s.player.enrollmentId).reasons).toEqual([
        { code: 'suspended', severity: 'hard', match: 1, total: 1, until: day(10) },
      ]);
      expect(row((await lists(s.coach1.token, after.id)).callable, s.player.enrollmentId)).toBeDefined();
    });

    it('the suspension belongs to the enrollment: the same person in another team stays callable', async () => {
      const s = await club('su-c10@test.it');
      const other = await s.enroll(s.t2.seasonId, s.player.personId, 'player');
      const m = await s.match(s.t2.teamId, 5);
      await s.match(s.t1.teamId, 5);
      await suspend(s.coach1.token, s.player.enrollmentId, byMatches(1));
      expect(row((await lists(s.coach2.token, m.id)).callable, other.id)).toBeDefined();
    });

    it('a staff member cannot say available for a covered match, can say not available, and is free for trainings', async () => {
      const s = await club('su-c11@test.it');
      const m = await s.match(s.t1.teamId, 5);
      const free = await s.event(s.t1.teamId, 5);
      await suspend(s.coach1.token, s.assistant.enrollmentId, byMatches(1));
      const refused = await send(s.assistant.token, 'PUT', `/events/${m.id}/availability/me`, { response: 'confirmed' });
      expect(code(refused)).toEqual([409, 'SUSPENDED']);
      expect((await send(s.assistant.token, 'PUT', `/events/${m.id}/availability/me`, { response: 'declined' })).status).toBe(200);
      expect((await send(s.assistant.token, 'PUT', `/events/${free.id}/availability/me`, { response: 'confirmed' })).status).toBe(200);

      const l = await lists(s.assistant.token, m.id);
      expect(row(l.staff, s.assistant.enrollmentId).suspension).toEqual({ match: 1, total: 1, until: null });
      expect(row((await lists(s.assistant.token, free.id)).staff, s.assistant.enrollmentId).suspension ?? null).toBeNull();
    });
  });

  describe('who sees them', () => {
    async function withSuspension(email: string) {
      const s = await club(email);
      const m = await s.match(s.t1.teamId, 5);
      const made = await suspend(s.coach1.token, s.player.enrollmentId, byMatches(1));
      return { s, m, id: made.body.id as string };
    }

    it('the person, the staff of the team and the admin read it', async () => {
      const { s } = await withSuspension('su-r1@test.it');
      for (const who of [s.player, s.coach1, s.assistant]) {
        const r = await send(who.token, 'GET', `/enrollments/${s.player.enrollmentId}/suspensions`);
        expect([r.status, r.body.suspensions.length]).toEqual([200, 1]);
      }
      expect((await send(s.admin, 'GET', `/enrollments/${s.player.enrollmentId}/suspensions`)).status).toBe(200);
      for (const who of [s.coach1.token, s.assistant.token, s.admin]) {
        const r = await send(who, 'GET', `/seasons/${s.t1.seasonId}/suspensions`);
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(1);
        expect(r.body[0]).toMatchObject({ enrollmentId: s.player.enrollmentId, name: 'p1', surname: 'Rossi', type: 'player', form: 'matches' });
      }
    });

    it('the person finds their own in one place', async () => {
      const { s } = await withSuspension('su-r2@test.it');
      const mine = await send(s.player.token, 'GET', '/suspensions/me');
      expect(mine.status).toBe(200);
      expect(mine.body).toHaveLength(1);
      expect(mine.body[0]).toMatchObject({ enrollmentId: s.player.enrollmentId, type: 'player', teamName: 'T1' });
      expect(mine.body[0].suspensions).toHaveLength(1);
      expect((await send(s.mate.token, 'GET', '/suspensions/me')).body[0].suspensions).toEqual([]);
    });

    it('a teammate never reads it, in the roster list, in the enrollment list or in the call-up', async () => {
      const { s, m } = await withSuspension('su-r3@test.it');
      expect(code(await send(s.mate.token, 'GET', `/enrollments/${s.player.enrollmentId}/suspensions`))).toEqual([403, 'PERMISSION_DENIED']);
      expect(code(await send(s.mate.token, 'GET', `/seasons/${s.t1.seasonId}/suspensions`))).toEqual([403, 'PERMISSION_DENIED']);
      expect(code(await send(s.player.token, 'GET', `/seasons/${s.t1.seasonId}/suspensions`))).toEqual([403, 'PERMISSION_DENIED']);
      const view = await lists(s.mate.token, m.id);
      expect(JSON.stringify(view)).not.toMatch(/suspen/i);
      const own = await lists(s.player.token, m.id);
      expect(JSON.stringify(own)).not.toMatch(/suspen/i);
    });

    it('the staff of another team never reads it', async () => {
      const { s } = await withSuspension('su-r4@test.it');
      expect(code(await send(s.coach2.token, 'GET', `/enrollments/${s.player.enrollmentId}/suspensions`))).toEqual([403, 'PERMISSION_DENIED']);
      expect(code(await send(s.coach2.token, 'GET', `/seasons/${s.t1.seasonId}/suspensions`))).toEqual([403, 'PERMISSION_DENIED']);
    });

    it('a staff member sees a teammate in the not callable list of the match with the reason', async () => {
      const { s, m } = await withSuspension('su-r5@test.it');
      const l = await lists(s.assistant.token, m.id);
      expect(row(l.notCallable, s.player.enrollmentId).reasons[0].code).toBe('suspended');
    });
  });

  describe('context of the team screen', () => {
    it('gives who can be suspended and the season to who reads, and whether they can record', async () => {
      const s = await club('su-10@test.it');
      const url = `/seasons/${s.t1.seasonId}/suspensions-context`;
      const r = await send(s.coach1.token, 'GET', url);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ canManage: true, status: 'active', seasonName: 'Now', seasonStart: day(-60), seasonEnd: day(400), teamName: 'T1' });
      // Everybody enrolled except the reader: nobody records on themselves.
      expect(r.body.people.map((p: { enrollmentId: string }) => p.enrollmentId).sort()).toEqual([s.assistant.enrollmentId, s.mate.enrollmentId, s.player.enrollmentId].sort());
      expect(r.body.people[0]).toEqual(expect.objectContaining({ name: expect.any(String), type: expect.any(String) }));

      expect((await send(s.admin, 'GET', url)).body.people).toHaveLength(4);
      const assistant = await send(s.assistant.token, 'GET', url);
      expect(assistant.status).toBe(200);
      expect(assistant.body.canManage).toBe(false);
    });

    it('is not for players, other teams or other clubs, and a closed season cannot be recorded on', async () => {
      const s = await club('su-11@test.it');
      const other = await club('su-11b@test.it');
      const url = `/seasons/${s.t1.seasonId}/suspensions-context`;
      expect(code(await send(s.player.token, 'GET', url))).toEqual([403, 'PERMISSION_DENIED']);
      expect(code(await send(s.coach2.token, 'GET', url))).toEqual([403, 'PERMISSION_DENIED']);
      expect(code(await send(other.admin, 'GET', url))).toEqual([404, 'SEASON_NOT_FOUND']);
      expect((await send(s.admin, 'POST', `/seasons/${s.t1.seasonId}/close`)).status).toBe(200);
      const closed = await send(s.admin, 'GET', url);
      expect(closed.body).toMatchObject({ canManage: false, status: 'closed' });
    });
  });

  describe('season clone carries the remaining matches', () => {
    const clone = (token: string, seasonId: string, enrollments: string[], extra: object = {}) =>
      send(token, 'POST', `/seasons/${seasonId}/clone`, { name: '2027/28', startDate: day(500), endDate: day(800), enrollments, ...extra });

    it('carries what the season could not cover, with the competitions, from the first day of the new one', async () => {
      const s = await club('su-s1@test.it');
      await s.match(s.t1.teamId, 5, { competition: 'League' });
      await suspend(s.coach1.token, s.player.enrollmentId, byMatches(3, { competitions: ['League'] }));
      await suspend(s.coach1.token, s.mate.enrollmentId, byMatches(1));
      const r = await clone(s.admin, s.t1.seasonId, [s.player.enrollmentId, s.mate.enrollmentId], { carrySuspensions: true });
      expect(r.status).toBe(201);
      expect(r.body.suspensions).toBe(1);

      const list = await send(s.admin, 'GET', `/seasons/${r.body.season.id}/suspensions`);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({ form: 'matches', matchCount: 2, startDate: day(500), competitions: ['League'], originEventId: null, name: 'p1' });
    });

    it('does not carry them unless asked', async () => {
      const s = await club('su-s2@test.it');
      await suspend(s.coach1.token, s.player.enrollmentId, byMatches(3));
      const r = await clone(s.admin, s.t1.seasonId, [s.player.enrollmentId]);
      expect(r.status).toBe(201);
      expect(r.body.suspensions).toBe(0);
      expect((await send(s.admin, 'GET', `/seasons/${r.body.season.id}/suspensions`)).body).toEqual([]);
    });

    it('carries only the enrollments chosen, and never a period', async () => {
      const s = await club('su-s3@test.it');
      await suspend(s.coach1.token, s.player.enrollmentId, byMatches(3));
      await suspend(s.coach1.token, s.mate.enrollmentId, byPeriod(3, 9));
      const r = await clone(s.admin, s.t1.seasonId, [s.mate.enrollmentId], { carrySuspensions: true });
      expect(r.body.suspensions).toBe(0);
    });

    it('the carried suspension blocks the first matches of the new season', async () => {
      const s = await club('su-s4@test.it');
      await suspend(s.coach1.token, s.player.enrollmentId, byMatches(2));
      // The certificate of the club helper would be expired by then: the player renews it.
      await post(s.admin, `/people/${s.player.personId}/certificates`, { type: 'competitive', issueDate: day(0), expiryDate: day(900) });
      const r = await clone(s.admin, s.t1.seasonId, [s.player.enrollmentId], { carrySuspensions: true });
      expect(r.body.suspensions).toBe(1);
      expect(await trail('suspension_created', (await send(s.admin, 'GET', `/seasons/${r.body.season.id}/suspensions`)).body[0].id)).toHaveLength(1);
      expect((await send(s.admin, 'POST', `/seasons/${s.t1.seasonId}/close`)).status).toBe(200);
      expect((await send(s.admin, 'POST', `/seasons/${r.body.season.id}/active`)).status).toBe(200);
      const m1 = await s.match(s.t1.teamId, 520);
      const m2 = await s.match(s.t1.teamId, 527);
      const m3 = await s.match(s.t1.teamId, 534);
      const newPlayer = (await send(s.admin, 'GET', `/seasons/${r.body.season.id}/roster`)).body[0].id as string;
      expect(row((await lists(s.admin, m1.id)).notCallable, newPlayer).reasons[0]).toMatchObject({ code: 'suspended', match: 1, total: 2 });
      expect(row((await lists(s.admin, m2.id)).notCallable, newPlayer).reasons[0]).toMatchObject({ code: 'suspended', match: 2, total: 2 });
      expect(row((await lists(s.admin, m3.id)).callable, newPlayer)).toBeDefined();
    });
  });
});
