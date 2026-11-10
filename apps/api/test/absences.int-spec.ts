import { AuditLog } from '../src/entities/audit-log.entity';
import { Callup } from '../src/entities/callup.entity';
import { CallupResponseChange } from '../src/entities/callup-response-change.entity';
import { Notification } from '../src/entities/notification.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const slot = (offset: number) => ({ start: `${day(offset)}T16:00:00Z`, end: `${day(offset)}T17:30:00Z` });

describe('declared absences (rule 10)', () => {
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

  /** Club with T1 and T2 (active seasons around today): a coach, an assistant and a player of T1, a coach of T2. */
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
    const person = (tag: string) => post(admin, '/people', { name: tag, surname: 'Rossi', birthDate: '1990-01-01', email: `${tag}-${email}` });
    const enroll = (seasonId: string, personId: string, type: 'player' | 'staff', staffRole?: string) =>
      post(admin, `/seasons/${seasonId}/enrollments`, { personId, type, ...(staffRole ? { staffRole } : {}) });
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
    return { admin, t1, t2, coach1, assistant, coach2, player, mate, event, enroll, person, withAccount };
  }

  const declare = (token: string, enrollmentId: string, startDate: string, endDate: string | null = null) =>
    send(token, 'POST', `/enrollments/${enrollmentId}/absences`, { startDate, ...(endDate ? { endDate } : {}) });
  const lists = async (token: string, eventId: string) => {
    const r = await send(token, 'GET', `/events/${eventId}/callups`);
    expect(r.status).toBe(200);
    return r.body;
  };
  const callUp = (token: string, eventId: string, enrollmentId: string, extra: object = {}) =>
    send(token, 'POST', `/events/${eventId}/callups`, { enrollmentId, ...extra });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
const row = (rows: any[], id: string) => rows.find((r) => r.enrollmentId === id);

  describe('effect on the call-up lists', () => {
    it('during an absence the player is not callable and the label carries the end date', async () => {
      const s = await club('ab-1@test.it');
      const ev = await s.event(s.t1.teamId, 12);
      expect((await declare(s.player.token, s.player.enrollmentId, day(10), day(15))).status).toBe(201);
      const l = await lists(s.coach1.token, ev.id);
      expect(row(l.callable, s.player.enrollmentId)).toBeUndefined();
      expect(row(l.notCallable, s.player.enrollmentId).reasons).toEqual([{ code: 'absence', severity: 'hard', until: day(15) }]);
      expect(row(l.callable, s.mate.enrollmentId)).toBeDefined();
    });

    it('outside the period the player is callable as usual, on the first and last day not', async () => {
      const s = await club('ab-2@test.it');
      await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      for (const [offset, blocked] of [[9, false], [10, true], [15, true], [16, false]] as const) {
        const ev = await s.event(s.t1.teamId, offset);
        const l = await lists(s.coach1.token, ev.id);
        expect([offset, !!row(l.notCallable, s.player.enrollmentId)]).toEqual([offset, blocked]);
      }
    });

    it('the coach cannot call the player up, not even with a confirmation; removing the absence makes the player callable', async () => {
      const s = await club('ab-3@test.it');
      const ev = await s.event(s.t1.teamId, 12);
      const made = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const refused = await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      expect([refused.status, refused.body.code, refused.body.reasons]).toEqual([409, 'ENROLLMENT_NOT_CALLABLE', ['absence']]);
      expect((await callUp(s.coach1.token, ev.id, s.player.enrollmentId, { confirm: true })).status).toBe(409);
      expect((await send(s.player.token, 'DELETE', `/absences/${made.body.absence.id}`)).status).toBe(204);
      expect((await callUp(s.coach1.token, ev.id, s.player.enrollmentId)).status).toBe(201);
    });

    it('an absence without an end blocks every later event, with no end date', async () => {
      const s = await club('ab-4@test.it');
      await declare(s.player.token, s.player.enrollmentId, day(10));
      const ev = await s.event(s.t1.teamId, 200);
      const l = await lists(s.coach1.token, ev.id);
      expect(row(l.notCallable, s.player.enrollmentId).reasons).toEqual([{ code: 'absence', severity: 'hard' }]);
    });

    it('adjacent absences read as one: the end date is the end of the continuous block', async () => {
      const s = await club('ab-5@test.it');
      await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      await declare(s.player.token, s.player.enrollmentId, day(16), day(20));
      const ev = await s.event(s.t1.teamId, 12);
      const l = await lists(s.coach1.token, ev.id);
      expect(row(l.notCallable, s.player.enrollmentId).reasons[0].until).toBe(day(20));
    });

    it('the absence belongs to the enrollment: the same person in another team stays callable', async () => {
      const s = await club('ab-6@test.it');
      const other = await s.enroll(s.t2.seasonId, s.player.personId, 'player');
      await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const ev = await s.event(s.t2.teamId, 12);
      const l = await lists(s.coach2.token, ev.id);
      expect(row(l.callable, other.id)).toBeDefined();
      expect(row(l.notCallable, other.id)).toBeUndefined();
    });

    it('a teammate sees nothing of it: the player view has no lists and no reasons', async () => {
      const s = await club('ab-7@test.it');
      const ev = await s.event(s.t1.teamId, 12);
      await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const l = await lists(s.mate.token, ev.id);
      expect(JSON.stringify(l)).not.toContain('absence');
      expect(l.notCallable).toBeUndefined();
    });
  });

  describe('creating, changing and cancelling', () => {
    it('answers with the absence and the events already called up in the period', async () => {
      const s = await club('ab-10@test.it');
      const inside = await s.event(s.t1.teamId, 12);
      const outside = await s.event(s.t1.teamId, 30);
      const noCallup = await s.event(s.t1.teamId, 13);
      for (const ev of [inside, outside]) await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      expect(r.status).toBe(201);
      expect(r.body.absence).toMatchObject({ startDate: day(10), endDate: day(15) });
      expect(r.body.absence.id).toEqual(expect.any(String));
      expect(r.body.affected.map((e: { eventId: string }) => e.eventId)).toEqual([inside.id]);
      expect(noCallup.id).toBeDefined();
    });

    it('declining in one tap declines only the events sent and keeps every call-up', async () => {
      const s = await club('ab-11@test.it');
      const evs = [await s.event(s.t1.teamId, 11), await s.event(s.t1.teamId, 12), await s.event(s.t1.teamId, 13)];
      for (const ev of evs) await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const d = await send(s.player.token, 'POST', `/absences/${r.body.absence.id}/decline`, { eventIds: [evs[0].id, evs[1].id] });
      expect([d.status, d.body.declined.sort()]).toEqual([200, [evs[0].id, evs[1].id].sort()]);

      const em = t.orm.em.fork();
      const rows = await em.find(Callup, { enrollment: s.player.enrollmentId }, { filters: false });
      expect(rows).toHaveLength(3);
      const by = (id: string) => rows.find((c) => c.event.id === id);
      expect([by(evs[0].id)?.response, by(evs[0].id)?.reason]).toEqual(['declined', 'not_available']);
      expect(by(evs[1].id)?.response).toBe('declined');
      expect(by(evs[2].id)?.response).toBe('pending');
      const trail = await em.find(CallupResponseChange, { enrollment: s.player.enrollmentId }, { filters: false });
      expect(trail).toHaveLength(2);
    });

    it('declining twice does nothing the second time', async () => {
      const s = await club('ab-12@test.it');
      const ev = await s.event(s.t1.teamId, 12);
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const url = `/absences/${r.body.absence.id}/decline`;
      expect((await send(s.player.token, 'POST', url, { eventIds: [ev.id] })).status).toBe(200);
      expect((await send(s.player.token, 'POST', url, { eventIds: [ev.id] })).status).toBe(200);
      const trail = await t.orm.em.fork().find(CallupResponseChange, { enrollment: s.player.enrollmentId }, { filters: false });
      expect(trail).toHaveLength(1);
    });

    it('an event outside the period is refused and nothing is declined, not even the valid ones', async () => {
      const s = await club('ab-13@test.it');
      const inside = await s.event(s.t1.teamId, 12);
      const outside = await s.event(s.t1.teamId, 30);
      for (const ev of [inside, outside]) await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const d = await send(s.player.token, 'POST', `/absences/${r.body.absence.id}/decline`, { eventIds: [inside.id, outside.id] });
      expect([d.status, d.body.code]).toEqual([400, 'EVENT_NOT_IN_ABSENCE']);
      const rows = await t.orm.em.fork().find(Callup, { enrollment: s.player.enrollmentId }, { filters: false });
      expect(rows.map((c) => c.response)).toEqual(['pending', 'pending']);
    });

    it('an event where the player is not called up is refused', async () => {
      const s = await club('ab-14@test.it');
      const ev = await s.event(s.t1.teamId, 12);
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const d = await send(s.player.token, 'POST', `/absences/${r.body.absence.id}/decline`, { eventIds: [ev.id] });
      expect([d.status, d.body.code]).toEqual([400, 'EVENT_NOT_IN_ABSENCE']);
    });

    it('an empty or malformed list is invalid data', async () => {
      const s = await club('ab-15@test.it');
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      for (const eventIds of [[], ['nope'], 'x', undefined]) {
        const d = await send(s.player.token, 'POST', `/absences/${r.body.absence.id}/decline`, { eventIds } as object);
        expect([d.status, d.body.code]).toEqual([400, 'INVALID_DATA']);
      }
    });

    it('changing the period moves the block and lists the events affected by the new dates', async () => {
      const s = await club('ab-16@test.it');
      const ev = await s.event(s.t1.teamId, 22);
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const u = await send(s.player.token, 'PATCH', `/absences/${r.body.absence.id}`, { startDate: day(20), endDate: day(25) });
      expect(u.status).toBe(200);
      expect(u.body.absence).toMatchObject({ id: r.body.absence.id, startDate: day(20), endDate: day(25) });
      expect(u.body.affected.map((e: { eventId: string }) => e.eventId)).toEqual([ev.id]);
      const l = await lists(s.coach1.token, await s.event(s.t1.teamId, 12).then((e) => e.id));
      expect(row(l.callable, s.player.enrollmentId)).toBeDefined();
    });

    it('an absence can be turned into one until further notice and back', async () => {
      const s = await club('ab-17@test.it');
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const open = await send(s.player.token, 'PATCH', `/absences/${r.body.absence.id}`, { startDate: day(10), endDate: null });
      expect(open.body.absence.endDate).toBeNull();
      const closed = await send(s.player.token, 'PATCH', `/absences/${r.body.absence.id}`, { startDate: day(10), endDate: day(12) });
      expect(closed.body.absence.endDate).toBe(day(12));
    });

    it('cancelling frees the player again', async () => {
      const s = await club('ab-18@test.it');
      const ev = await s.event(s.t1.teamId, 12);
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      expect((await send(s.player.token, 'DELETE', `/absences/${r.body.absence.id}`)).status).toBe(204);
      expect(row((await lists(s.coach1.token, ev.id)).callable, s.player.enrollmentId)).toBeDefined();
      expect((await send(s.player.token, 'DELETE', `/absences/${r.body.absence.id}`)).body.code).toBe('ABSENCE_NOT_FOUND');
    });

    it('cancelling does not bring back the call-ups already declined', async () => {
      const s = await club('ab-19@test.it');
      const ev = await s.event(s.t1.teamId, 12);
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      await send(s.player.token, 'POST', `/absences/${r.body.absence.id}/decline`, { eventIds: [ev.id] });
      await send(s.player.token, 'DELETE', `/absences/${r.body.absence.id}`);
      const rows = await t.orm.em.fork().find(Callup, { enrollment: s.player.enrollmentId }, { filters: false });
      expect(rows[0]?.response).toBe('declined');
    });
  });

  describe('validation', () => {
    it('a period outside the season is refused', async () => {
      const s = await club('ab-20@test.it');
      for (const [from, to] of [[day(-61), day(-50)], [day(10), day(401)], [day(401), null]] as const) {
        const r = await declare(s.player.token, s.player.enrollmentId, from, to);
        expect([r.status, r.body.code]).toEqual([400, 'ABSENCE_OUTSIDE_SEASON']);
      }
    });

    it('an end before the start and a malformed day are invalid data', async () => {
      const s = await club('ab-21@test.it');
      expect((await declare(s.player.token, s.player.enrollmentId, day(15), day(10))).body.code).toBe('INVALID_DATA');
      expect((await declare(s.player.token, s.player.enrollmentId, '10/11/2026')).body.code).toBe('INVALID_DATA');
      expect((await send(s.player.token, 'POST', `/enrollments/${s.player.enrollmentId}/absences`, {})).body.code).toBe('INVALID_DATA');
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      expect((await send(s.player.token, 'PATCH', `/absences/${r.body.absence.id}`, { startDate: day(15), endDate: day(10) })).body.code).toBe('INVALID_DATA');
    });

    it('a closed season is read only', async () => {
      const s = await club('ab-22@test.it');
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      expect((await t.req('POST', `/seasons/${s.t1.seasonId}/close`, { token: s.admin })).status).toBe(200);
      expect((await declare(s.player.token, s.player.enrollmentId, day(20), day(25))).body.code).toBe('SEASON_CLOSED');
      expect((await send(s.player.token, 'PATCH', `/absences/${r.body.absence.id}`, { startDate: day(11), endDate: day(15) })).body.code).toBe('SEASON_CLOSED');
      expect((await send(s.player.token, 'DELETE', `/absences/${r.body.absence.id}`)).body.code).toBe('SEASON_CLOSED');
    });

    it('a closed enrollment cannot get new absences', async () => {
      const s = await club('ab-23@test.it');
      expect((await t.req('POST', `/enrollments/${s.player.enrollmentId}/close`, { token: s.admin })).status).toBe(200);
      expect((await declare(s.player.token, s.player.enrollmentId, day(10), day(15))).body.code).toBe('ENROLLMENT_NOT_FOUND');
    });
  });

  describe('who may do what', () => {
    it('another player cannot create, change, cancel, read or decline on someone else\'s absence', async () => {
      const s = await club('ab-30@test.it');
      const ev = await s.event(s.t1.teamId, 12);
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const id = r.body.absence.id;
      for (const [method, url, body] of [
        ['POST', `/enrollments/${s.player.enrollmentId}/absences`, { startDate: day(20) }],
        ['PATCH', `/absences/${id}`, { startDate: day(11), endDate: day(15) }],
        ['DELETE', `/absences/${id}`, undefined],
        ['GET', `/enrollments/${s.player.enrollmentId}/absences`, undefined],
        ['POST', `/absences/${id}/decline`, { eventIds: [ev.id] }],
      ] as const) {
        const x = await send(s.mate.token, method, url, body);
        expect([method, x.status, x.body.code]).toEqual([method, 403, 'PERMISSION_DENIED']);
      }
      const rows = await t.orm.em.fork().find(Callup, { enrollment: s.player.enrollmentId }, { filters: false });
      expect(rows[0]?.response).toBe('pending');
    });

    it('staff, managers and the admin read the roster absences but never write them', async () => {
      const s = await club('ab-31@test.it');
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      await declare(s.player.token, s.player.enrollmentId, day(16), day(20));
      await post(s.admin, '/invitations', { email: 'ab-31m@test.it', role: 'manager', scope: 'team', teamId: s.t1.teamId });
      const m = await accept('ab-31m@test.it');
      for (const who of [s.coach1.token, s.assistant.token, m.token, s.admin]) {
        const g = await send(who, 'GET', `/enrollments/${s.player.enrollmentId}/absences`);
        expect(g.status).toBe(200);
        expect(g.body.editable).toBe(false);
        // Dates only, in the merged form, no ids to write on.
        expect(g.body.absences).toEqual([{ startDate: day(10), endDate: day(20) }]);
        const w = await send(who, 'PATCH', `/absences/${r.body.absence.id}`, { startDate: day(11), endDate: day(15) });
        expect([w.status, w.body.code]).toEqual([403, 'PERMISSION_DENIED']);
        expect((await send(who, 'DELETE', `/absences/${r.body.absence.id}`)).status).toBe(403);
        expect((await declare(who, s.player.enrollmentId, day(30))).status).toBe(403);
      }
    });

    it('the owner reads their own absences with ids, as they were entered', async () => {
      const s = await club('ab-32@test.it');
      await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      await declare(s.player.token, s.player.enrollmentId, day(16), day(20));
      const g = await send(s.player.token, 'GET', `/enrollments/${s.player.enrollmentId}/absences`);
      expect(g.body.editable).toBe(true);
      expect(g.body.absences).toHaveLength(2);
      expect(g.body.absences[0].id).toEqual(expect.any(String));
    });

    it('the staff of another team and a manager of another team cannot read', async () => {
      const s = await club('ab-33@test.it');
      await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      await post(s.admin, '/invitations', { email: 'ab-33m@test.it', role: 'manager', scope: 'team', teamId: s.t2.teamId });
      const m = await accept('ab-33m@test.it');
      for (const who of [s.coach2.token, m.token]) {
        const g = await send(who, 'GET', `/enrollments/${s.player.enrollmentId}/absences`);
        expect([g.status, g.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      }
    });

    it('an enrollment or an absence of another club is a 404', async () => {
      const s = await club('ab-34@test.it');
      const other = await club('ab-34b@test.it');
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      expect((await declare(other.admin, s.player.enrollmentId, day(10))).body.code).toBe('ENROLLMENT_NOT_FOUND');
      expect((await send(other.admin, 'GET', `/enrollments/${s.player.enrollmentId}/absences`)).body.code).toBe('ENROLLMENT_NOT_FOUND');
      expect((await send(other.player.token, 'PATCH', `/absences/${r.body.absence.id}`, { startDate: day(11) })).body.code).toBe('ABSENCE_NOT_FOUND');
      expect((await send(other.player.token, 'DELETE', `/absences/${r.body.absence.id}`)).body.code).toBe('ABSENCE_NOT_FOUND');
      expect((await send(other.player.token, 'POST', `/absences/${r.body.absence.id}/decline`, { eventIds: [r.body.absence.id] })).body.code).toBe('ABSENCE_NOT_FOUND');
    });

    it('the season view lists who is away, dates only and merged, for staff, managers in scope and the admin', async () => {
      const s = await club('ab-60@test.it');
      await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      await declare(s.player.token, s.player.enrollmentId, day(16), day(20));
      await declare(s.coach1.token, s.coach1.enrollmentId, day(30));
      await declare(s.coach2.token, s.coach2.enrollmentId, day(5), day(6));
      await post(s.admin, '/invitations', { email: 'ab-60m@test.it', role: 'manager', scope: 'team', teamId: s.t1.teamId });
      const m = await accept('ab-60m@test.it');
      for (const who of [s.coach1.token, s.assistant.token, m.token, s.admin]) {
        const g = await send(who, 'GET', `/seasons/${s.t1.seasonId}/absences`);
        expect(g.status).toBe(200);
        expect(g.body).toEqual([
          { enrollmentId: s.player.enrollmentId, personId: s.player.personId, name: 'p1', surname: 'Rossi', type: 'player', staffRole: null, absences: [{ startDate: day(10), endDate: day(20) }] },
          { enrollmentId: s.coach1.enrollmentId, personId: s.coach1.personId, name: 'c1', surname: 'Rossi', type: 'staff', staffRole: 'coach', absences: [{ startDate: day(30), endDate: null }] },
        ]);
      }
    });

    it('nobody without absences is listed, and an empty season gives an empty list', async () => {
      const s = await club('ab-61@test.it');
      const g = await send(s.coach1.token, 'GET', `/seasons/${s.t1.seasonId}/absences`);
      expect([g.status, g.body]).toEqual([200, []]);
    });

    it('a player of the team, the staff and the manager of another team cannot read the season view', async () => {
      const s = await club('ab-62@test.it');
      await declare(s.mate.token, s.mate.enrollmentId, day(10), day(15));
      await post(s.admin, '/invitations', { email: 'ab-62m@test.it', role: 'manager', scope: 'team', teamId: s.t2.teamId });
      const m = await accept('ab-62m@test.it');
      for (const who of [s.player.token, s.mate.token, s.coach2.token, m.token]) {
        const g = await send(who, 'GET', `/seasons/${s.t1.seasonId}/absences`);
        expect([g.status, g.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      }
    });

    it('the season view leaves out people who left the team or are disabled, and is a 404 across clubs', async () => {
      const s = await club('ab-63@test.it');
      const other = await club('ab-63b@test.it');
      await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      await declare(s.mate.token, s.mate.enrollmentId, day(10), day(15));
      expect((await t.req('POST', `/enrollments/${s.mate.enrollmentId}/close`, { token: s.admin })).status).toBe(200);
      const g = await send(s.admin, 'GET', `/seasons/${s.t1.seasonId}/absences`);
      expect(g.body.map((r: { enrollmentId: string }) => r.enrollmentId)).toEqual([s.player.enrollmentId]);
      const r = await send(other.admin, 'GET', `/seasons/${s.t1.seasonId}/absences`);
      expect([r.status, r.body.code]).toEqual([404, 'SEASON_NOT_FOUND']);
    });

    it('the calendar access tells who may open the season view: staff, managers in scope and the admin, never a player', async () => {
      const s = await club('ab-64@test.it');
      await post(s.admin, '/invitations', { email: 'ab-64m@test.it', role: 'manager', scope: 'team', teamId: s.t1.teamId });
      const m = await accept('ab-64m@test.it');
      const flag = async (token: string) => (await send(token, 'GET', `/seasons/${s.t1.seasonId}/events-access`)).body.canSeeAbsences;
      expect(await Promise.all([s.admin, s.coach1.token, s.assistant.token, m.token].map(flag))).toEqual([true, true, true, true]);
      expect(await Promise.all([s.player.token, s.mate.token].map(flag))).toEqual([false, false]);
    });

    it('/absences/me lists the person\'s own open enrollments with their absences', async () => {
      const s = await club('ab-35@test.it');
      const other = await s.enroll(s.t2.seasonId, s.player.personId, 'player');
      await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const g = await send(s.player.token, 'GET', '/absences/me');
      expect(g.status).toBe(200);
      const byId = (id: string) => g.body.find((x: { enrollmentId: string }) => x.enrollmentId === id);
      expect(g.body).toHaveLength(2);
      expect(byId(s.player.enrollmentId)).toMatchObject({ type: 'player', teamName: 'T1', seasonName: 'Now', seasonStatus: 'active', seasonStart: day(-60), seasonEnd: day(400) });
      expect(byId(s.player.enrollmentId).absences).toHaveLength(1);
      expect(byId(other.id).absences).toEqual([]);
      expect((await send(s.admin, 'GET', '/absences/me')).body).toEqual([]);
    });
  });

  describe('audit and notification', () => {
    it('creation, change and cancellation are audited with the dates only', async () => {
      const s = await club('ab-40@test.it');
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const id = r.body.absence.id;
      await send(s.player.token, 'PATCH', `/absences/${id}`, { startDate: day(11), endDate: null });
      await send(s.player.token, 'DELETE', `/absences/${id}`);
      const log = await t.orm.em.fork().find(AuditLog, { entityId: id }, { filters: false, orderBy: { createdAt: 'asc' } });
      expect(log.map((l) => l.action)).toEqual(['absence_created', 'absence_modified', 'absence_cancelled']);
      expect(log[0]?.meta).toEqual({ enrollmentId: s.player.enrollmentId, startDate: day(10), endDate: day(15) });
      expect(log[1]?.meta).toMatchObject({ startDate: day(11), endDate: null });
      expect(log[0]?.user?.id).toBe(s.player.userId);
    });

    it('a refused request writes no audit', async () => {
      const s = await club('ab-41@test.it');
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      await send(s.mate.token, 'DELETE', `/absences/${r.body.absence.id}`);
      await declare(s.player.token, s.player.enrollmentId, day(15), day(10));
      const log = await t.orm.em.fork().find(AuditLog, { entityId: r.body.absence.id }, { filters: false });
      expect(log.map((l) => l.action)).toEqual(['absence_created']);
    });

    it('the staff of the team get an in-app notification, nobody else', async () => {
      const s = await club('ab-42@test.it');
      const r = await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const em = t.orm.em.fork();
      const mine = async (userId: string) => em.find(Notification, { user: userId, type: 'absence_declared' as never }, { filters: false });
      for (const who of [s.coach1, s.assistant]) {
        const n = await mine(who.userId);
        expect(n).toHaveLength(1);
        expect(n[0]?.params).toMatchObject({ person: 'p1 Rossi', from: day(10), until: day(15) });
        expect(n[0]?.dedupKey).toBe(`absence:${r.body.absence.id}`);
      }
      for (const who of [s.coach2, s.player, s.mate]) expect(await mine(who.userId)).toEqual([]);
    });

    it('an absence until further notice carries no end in the notification, and a change does not notify again', async () => {
      const s = await club('ab-43@test.it');
      const r = await declare(s.player.token, s.player.enrollmentId, day(10));
      await send(s.player.token, 'PATCH', `/absences/${r.body.absence.id}`, { startDate: day(11), endDate: day(12) });
      const n = await t.orm.em.fork().find(Notification, { user: s.coach1.userId, type: 'absence_declared' as never }, { filters: false });
      expect(n).toHaveLength(1);
      expect(n[0]?.params).not.toHaveProperty('until');
    });

    it('the notification carries no health data and no free text', async () => {
      const s = await club('ab-44@test.it');
      await declare(s.player.token, s.player.enrollmentId, day(10), day(15));
      const n = await t.orm.em.fork().find(Notification, { user: s.coach1.userId }, { filters: false });
      expect(Object.keys(n[0]?.params ?? {}).sort()).toEqual(['club', 'from', 'person', 'until']);
    });
  });

  describe('staff', () => {
    it('a staff member declares their own absence and the other staff are notified', async () => {
      const s = await club('ab-50@test.it');
      const r = await declare(s.assistant.token, s.assistant.enrollmentId, day(10), day(15));
      expect(r.status).toBe(201);
      const em = t.orm.em.fork();
      expect(await em.count(Notification, { user: s.coach1.userId, type: 'absence_declared' as never }, { filters: false })).toBe(1);
      expect(await em.count(Notification, { user: s.assistant.userId, type: 'absence_declared' as never }, { filters: false })).toBe(0);
    });

    it('during an absence the staff member cannot declare available, but can declare not available', async () => {
      const s = await club('ab-51@test.it');
      const ev = await s.event(s.t1.teamId, 12);
      await declare(s.assistant.token, s.assistant.enrollmentId, day(10), day(15));
      const ok = await send(s.assistant.token, 'PUT', `/events/${ev.id}/availability/me`, { response: 'confirmed' });
      expect([ok.status, ok.body.code]).toEqual([409, 'IN_ABSENCE']);
      expect((await send(s.assistant.token, 'PUT', `/events/${ev.id}/availability/me`, { response: 'declined' })).status).toBe(200);
      const free = await s.event(s.t1.teamId, 30);
      expect((await send(s.assistant.token, 'PUT', `/events/${free.id}/availability/me`, { response: 'confirmed' })).status).toBe(200);
    });

    it('the staff row of the viewer says until when they are in absence', async () => {
      const s = await club('ab-52@test.it');
      const ev = await s.event(s.t1.teamId, 12);
      await declare(s.assistant.token, s.assistant.enrollmentId, day(10), day(15));
      const l = await lists(s.assistant.token, ev.id);
      const mine = l.staff.find((x: { mine: boolean }) => x.mine);
      expect(mine.absence).toEqual({ until: day(15) });
      expect(l.staff.find((x: { mine: boolean }) => !x.mine).absence).toBeUndefined();
    });

    it('a staff absence declines the availability already given, in one tap', async () => {
      const s = await club('ab-53@test.it');
      const ev = await s.event(s.t1.teamId, 12);
      await send(s.assistant.token, 'PUT', `/events/${ev.id}/availability/me`, { response: 'confirmed' });
      const r = await declare(s.assistant.token, s.assistant.enrollmentId, day(10), day(15));
      expect(r.body.affected.map((e: { eventId: string }) => e.eventId)).toEqual([ev.id]);
      const d = await send(s.assistant.token, 'POST', `/absences/${r.body.absence.id}/decline`, { eventIds: [ev.id] });
      expect(d.status).toBe(200);
      const rows = await t.orm.em.fork().find(Callup, { enrollment: s.assistant.enrollmentId }, { filters: false });
      expect([rows[0]?.response, rows[0]?.reason]).toEqual(['declined', null]);
    });
  });
});
