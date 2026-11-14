import { AuditLog } from '../src/entities/audit-log.entity';
import { AuditAction } from '../src/entities/enums';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment, createTeams } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const slot = (offset: number) => ({ start: `${day(offset)}T16:00:00Z`, end: `${day(offset)}T17:30:00Z` });

type Row = { enrollmentId: string; reasons: { code: string; severity: string; until?: string }[] };

describe('probably injured players in call-ups (#21)', () => {
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

  /**
   * Club with T1 and T2: coach and assistant coach of T1, coach of T2, a manager of T1, a player with an account in both
   * teams, all with a valid certificate. One training of T1 and one of T2 in 30 days.
   */
  async function club(email: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
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
    const enroll = (seasonId: string, personId: string, type: 'player' | 'staff', staffRole?: string) =>
      post(admin, `/seasons/${seasonId}/enrollments`, { personId, type, ...(staffRole ? { staffRole } : {}) });
    const staff = async (seasonId: string, tag: string, role: string) => {
      const p = await person(tag);
      const e = await enroll(seasonId, p.id, 'staff', role);
      await post(admin, '/invitations', { email: `${tag}-${email}`, role: 'staff', personId: p.id });
      return { ...(await accept(`${tag}-${email}`)), enrollmentId: e.id as string };
    };
    const coach1 = await staff(t1.seasonId, 'c1', 'coach');
    const assistant = await staff(t1.seasonId, 'as', 'assistant_coach');
    const coach2 = await staff(t2.seasonId, 'c2', 'coach');
    await post(admin, '/invitations', { email: `m-${email}`, role: 'manager', scope: 'team', teamId: t1.teamId });
    const manager = await accept(`m-${email}`);
    const p = await person('p1');
    const inT1 = await enroll(t1.seasonId, p.id, 'player');
    const inT2 = await enroll(t2.seasonId, p.id, 'player');
    await post(admin, '/invitations', { email: `p1-${email}`, role: 'player', personId: p.id });
    await post(admin, `/people/${p.id}/certificates`, { type: 'competitive', issueDate: day(-10), expiryDate: day(365) });
    const player = await accept(`p1-${email}`);
    for (const x of [t1, t2]) expect((await t.req('POST', `/seasons/${x.seasonId}/active`, { token: admin })).status).toBe(200);
    const ev1 = await post(admin, `/teams/${t1.teamId}/events`, { type: 'training', ...slot(30) });
    const ev2 = await post(admin, `/teams/${t2.teamId}/events`, { type: 'training', ...slot(30) });
    return { admin, t1, t2, coach1, assistant, coach2, manager, player, inT1: inT1.id as string, inT2: inT2.id as string, ev1: ev1.id as string, ev2: ev2.id as string };
  }

  const expect_ = (token: string, enrollmentId: string, startDate: string, returnDate: string) =>
    send(token, 'PUT', `/enrollments/${enrollmentId}/expected-injury`, { startDate, returnDate });
  const lists = async (token: string, eventId: string) => {
    const r = await send(token, 'GET', `/events/${eventId}/callups`);
    expect(r.status).toBe(200);
    return r.body as { calledUp: Row[]; callable: Row[]; notCallable: Row[] };
  };
  const rowOf = (l: { calledUp: Row[]; callable: Row[]; notCallable: Row[] }, id: string) =>
    [...l.calledUp, ...l.callable, ...l.notCallable].find((r) => r.enrollmentId === id) as Row;
  const codes = (r: Row) => r.reasons.map((x) => x.code);

  describe('the warning in the call-up', () => {
    it('a period covering the event warns staff, and the player can still be called up', async () => {
      const s = await club('ei-1@test.it');
      const r = await expect_(s.coach1.token, s.inT1, day(-2), day(40));
      expect([r.status, r.body]).toEqual([200, { enrollmentId: s.inT1, startDate: day(-2), returnDate: day(40) }]);
      const l = await lists(s.coach1.token, s.ev1);
      expect(l.callable.map((x) => x.enrollmentId)).toContain(s.inT1);
      expect(rowOf(l, s.inT1).reasons).toEqual([{ code: 'probably_injured', severity: 'warning', until: day(40) }]);
      expect((await send(s.coach1.token, 'POST', `/events/${s.ev1}/callups`, { enrollmentId: s.inT1 })).status).toBe(201);
      expect(codes(rowOf(await lists(s.coach1.token, s.ev1), s.inT1))).toEqual(['probably_injured']);
    });

    it('a period that ends before the event, or on its day, says nothing', async () => {
      const s = await club('ei-2@test.it');
      await expect_(s.coach1.token, s.inT1, day(-2), day(20));
      expect(codes(rowOf(await lists(s.coach1.token, s.ev1), s.inT1))).toEqual([]);
      await expect_(s.coach1.token, s.inT1, day(-2), day(30));
      expect(codes(rowOf(await lists(s.coach1.token, s.ev1), s.inT1))).toEqual([]);
    });

    it('the warning follows the person in the other team', async () => {
      const s = await club('ei-3@test.it');
      await expect_(s.coach1.token, s.inT1, day(-2), day(40));
      expect(codes(rowOf(await lists(s.coach2.token, s.ev2), s.inT2))).toEqual(['probably_injured']);
    });

    it('confirming the injury blocks the player everywhere and consumes the period', async () => {
      const s = await club('ei-4@test.it');
      await expect_(s.coach1.token, s.inT1, day(-2), day(40));
      await send(s.coach1.token, 'POST', `/events/${s.ev1}/callups`, { enrollmentId: s.inT1 });
      expect((await send(s.coach1.token, 'PUT', `/enrollments/${s.inT1}/status`, { status: 'injured' })).status).toBe(200);
      const l1 = await lists(s.coach1.token, s.ev1);
      // A call-up already made stays: staff see the block and remove the player by hand.
      expect(l1.calledUp.map((x) => x.enrollmentId)).toEqual([s.inT1]);
      expect(codes(rowOf(l1, s.inT1))).toEqual(['injured']);
      // The T2 event overlaps the call-up in T1, so busy_elsewhere shows too: only the injury matters here.
      expect(codes(rowOf(await lists(s.coach2.token, s.ev2), s.inT2))).toEqual(expect.arrayContaining(['injured']));
      expect(codes(rowOf(await lists(s.coach2.token, s.ev2), s.inT2))).not.toContain('probably_injured');
      // Back available: the period is gone, so no warning comes back.
      await send(s.coach1.token, 'PUT', `/enrollments/${s.inT1}/status`, { status: 'available' });
      expect(codes(rowOf(await lists(s.coach1.token, s.ev1), s.inT1))).toEqual([]);
    });

    it('staff end the period early or move the dates, and the call-up follows', async () => {
      const s = await club('ei-5@test.it');
      await expect_(s.coach1.token, s.inT1, day(-2), day(40));
      expect((await expect_(s.coach1.token, s.inT1, day(-2), day(25))).status).toBe(200);
      expect(codes(rowOf(await lists(s.coach1.token, s.ev1), s.inT1))).toEqual([]);
      await expect_(s.coach1.token, s.inT1, day(-2), day(40));
      expect((await send(s.coach1.token, 'DELETE', `/enrollments/${s.inT1}/expected-injury`)).status).toBe(204);
      expect(codes(rowOf(await lists(s.coach1.token, s.ev1), s.inT1))).toEqual([]);
      expect((await send(s.coach1.token, 'DELETE', `/enrollments/${s.inT1}/expected-injury`)).status).toBe(204);
    });
  });

  describe('who sees it', () => {
    it('the assistant coach, staff of the season, sees the warning', async () => {
      const s = await club('ei-10@test.it');
      await expect_(s.coach1.token, s.inT1, day(-2), day(40));
      expect(codes(rowOf(await lists(s.assistant.token, s.ev1), s.inT1))).toEqual(['probably_injured']);
    });

    it('a manager sees no injury data, neither in the call-up nor in the roster', async () => {
      const s = await club('ei-11@test.it');
      await expect_(s.coach1.token, s.inT1, day(-2), day(40));
      expect(codes(rowOf(await lists(s.manager.token, s.ev1), s.inT1))).toEqual([]);
      const roster = await send(s.manager.token, 'GET', `/seasons/${s.t1.seasonId}/team-roster`);
      expect(roster.status).toBe(200);
      expect(JSON.stringify(roster.body)).not.toContain(day(40));
    });

    it('staff with people.manage read the dates in the roster, and the read is audited', async () => {
      const s = await club('ei-12@test.it');
      await expect_(s.coach1.token, s.inT1, day(-2), day(40));
      const roster = await send(s.coach1.token, 'GET', `/seasons/${s.t1.seasonId}/team-roster`);
      const row = roster.body.rows.find((r: { id: string }) => r.id === s.inT1);
      expect(row.expectedInjury).toEqual({ startDate: day(-2), returnDate: day(40) });
      const reads = await t.orm.em.fork().find(AuditLog, { action: AuditAction.EXPECTED_INJURY_READ, entityId: s.t1.seasonId }, { filters: false });
      expect(reads).toHaveLength(1);
      const assistant = await send(s.assistant.token, 'GET', `/seasons/${s.t1.seasonId}/team-roster`);
      expect(assistant.body.rows.find((r: { id: string }) => r.id === s.inT1).expectedInjury).toBeNull();
    });

    it('the player reads their own period and state, and the read is audited', async () => {
      const s = await club('ei-13@test.it');
      await expect_(s.coach1.token, s.inT1, day(-2), day(40));
      const g = await send(s.player.token, 'GET', '/absences/me');
      const mine = g.body.find((x: { enrollmentId: string }) => x.enrollmentId === s.inT1);
      expect(mine).toMatchObject({ status: 'available', expectedInjury: { startDate: day(-2), returnDate: day(40) } });
      expect(g.body.find((x: { enrollmentId: string }) => x.enrollmentId === s.inT2).expectedInjury).toEqual({ startDate: day(-2), returnDate: day(40) });
      const reads = await t.orm.em.fork().find(AuditLog, { action: AuditAction.EXPECTED_INJURY_READ, user: s.player.userId }, { filters: false });
      expect(reads).toHaveLength(1);
    });

    it('a period already over is not shown to the player', async () => {
      const s = await club('ei-14@test.it');
      await expect_(s.coach1.token, s.inT1, day(-20), day(-5));
      const g = await send(s.player.token, 'GET', '/absences/me');
      expect(g.body.find((x: { enrollmentId: string }) => x.enrollmentId === s.inT1).expectedInjury).toBeNull();
    });
  });

  describe('who can write it', () => {
    it('staff without people.manage is refused, staff of another team does not see the enrollment', async () => {
      const s = await club('ei-20@test.it');
      const a = await expect_(s.assistant.token, s.inT1, day(-2), day(40));
      expect([a.status, a.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      const other = await club('ei-20b@test.it');
      const f = await expect_(other.coach1.token, s.inT1, day(-2), day(40));
      expect([f.status, f.body.code]).toEqual([404, 'ENROLLMENT_NOT_FOUND']);
      const d = await send(s.assistant.token, 'DELETE', `/enrollments/${s.inT1}/expected-injury`);
      expect(d.status).toBe(403);
    });

    it('the admin can record it', async () => {
      const s = await club('ei-21@test.it');
      expect((await expect_(s.admin, s.inT1, day(-2), day(40))).status).toBe(200);
    });

    it('refuses wrong dates, a staff enrollment and unknown fields', async () => {
      const s = await club('ei-22@test.it');
      const same = await expect_(s.coach1.token, s.inT1, day(5), day(5));
      expect([same.status, same.body.code]).toEqual([400, 'INVALID_DATA']);
      const bad = await expect_(s.coach1.token, s.inT1, '2026-02-30', day(5));
      expect([bad.status, bad.body.code]).toEqual([400, 'INVALID_DATA']);
      const staff = await expect_(s.coach1.token, s.assistant.enrollmentId, day(-2), day(40));
      expect([staff.status, staff.body.code]).toEqual([400, 'INVALID_DATA']);
      const extra = await send(s.coach1.token, 'PUT', `/enrollments/${s.inT1}/expected-injury`, { startDate: day(-2), returnDate: day(40), cause: 'knee' });
      expect(extra.status).toBe(400);
    });

    it('a closed enrollment is refused', async () => {
      const s = await club('ei-23@test.it');
      await send(s.admin, 'POST', `/enrollments/${s.inT1}/close`);
      const r = await expect_(s.coach1.token, s.inT1, day(-2), day(40));
      expect([r.status, r.body.code]).toEqual([409, 'ENROLLMENT_CLOSED']);
    });

    it('creation, change and end are audited with the dates only', async () => {
      const s = await club('ei-24@test.it');
      await expect_(s.coach1.token, s.inT1, day(-2), day(40));
      await expect_(s.coach1.token, s.inT1, day(-2), day(30));
      await send(s.coach1.token, 'DELETE', `/enrollments/${s.inT1}/expected-injury`);
      const log = await t.orm.em.fork().find(AuditLog, { entityId: s.inT1, action: { $like: 'expected_injury_%' } }, { filters: false, orderBy: { createdAt: 'asc' } });
      expect(log.map((l) => [l.action, l.meta])).toEqual([
        ['expected_injury_created', { startDate: day(-2), returnDate: day(40) }],
        ['expected_injury_modified', { startDate: day(-2), returnDate: day(30) }],
        ['expected_injury_ended', null],
      ]);
    });
  });
});
