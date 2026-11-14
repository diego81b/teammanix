import { AuditLog } from '../src/entities/audit-log.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment, createTeams, roleId } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const slot = (offset: number) => ({ start: `${day(offset)}T16:00:00Z`, end: `${day(offset)}T17:30:00Z` });

describe('attendance (slice 5, rule 11 and 12)', () => {
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

  /** Club with T1 and T2 (active seasons around today): a coach, a trainer, a player and a mate of T1, a coach of T2. */
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
    const withAccount = async (seasonId: string, tag: string, type: 'player' | 'staff', staffRole?: string) => {
      const p = await post(admin, '/people', { name: tag, surname: 'Rossi', birthDate: '1990-01-01', email: `${tag}-${email}` });
      const enrollment = await post(admin, `/seasons/${seasonId}/enrollments`, { personId: p.id, type, ...(staffRole ? { staffRoleId: await roleId(t.req, admin, staffRole) } : {}) });
      await post(admin, '/invitations', { email: `${tag}-${email}`, role: type, personId: p.id });
      return { ...(await accept(`${tag}-${email}`)), personId: p.id as string, enrollmentId: enrollment.id as string };
    };
    const coach1 = await withAccount(t1.seasonId, 'c1', 'staff', 'coach');
    const trainer = await withAccount(t1.seasonId, 'tr', 'staff', 'trainer');
    const coach2 = await withAccount(t2.seasonId, 'c2', 'staff', 'coach');
    const player = await withAccount(t1.seasonId, 'p1', 'player');
    const mate = await withAccount(t1.seasonId, 'p2', 'player');
    for (const x of [t1, t2]) expect((await t.req('POST', `/seasons/${x.seasonId}/active`, { token: admin })).status).toBe(200);
    const event = (teamId: string, offset: number, over: object = {}) => post(admin, `/teams/${teamId}/events`, { type: 'training', ...slot(offset), ...over });
    const manager = async (tag: string) => {
      await post(admin, '/invitations', { email: `${tag}-${email}`, role: 'manager', scope: 'team', teamId: t1.teamId });
      return accept(`${tag}-${email}`);
    };
    return { admin, t1, t2, coach1, trainer, coach2, player, mate, event, withAccount, manager };
  }

  const mark = (token: string, eventId: string, enrollmentId: string, outcome: string) =>
    send(token, 'PUT', `/events/${eventId}/attendance/${enrollmentId}`, { outcome });
  const view = async (token: string, eventId: string) => {
    const r = await send(token, 'GET', `/events/${eventId}/attendance`);
    expect(r.status).toBe(200);
    return r.body;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (rows: any[], id: string) => rows.find((r) => r.enrollmentId === id);

  describe('recording', () => {
    it('the coach marks players and staff and the totals of the event update', async () => {
      const s = await club('at-01@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      expect((await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'present')).status).toBe(200);
      expect((await mark(s.coach1.token, ev.id, s.mate.enrollmentId, 'late')).status).toBe(200);
      expect((await mark(s.coach1.token, ev.id, s.trainer.enrollmentId, 'absent_excused')).status).toBe(200);
      const v = await view(s.coach1.token, ev.id);
      expect(v.view).toBe('manage');
      expect(row(v.rows, s.player.enrollmentId)).toMatchObject({ outcome: 'present', type: 'player', name: 'p1' });
      expect(row(v.rows, s.trainer.enrollmentId)).toMatchObject({ outcome: 'absent_excused', type: 'staff' });
      expect(row(v.rows, s.coach1.enrollmentId).outcome).toBeNull();
      // Four people of the season so far: coach, trainer, player, mate. Late counts as attended.
      expect(v.summary).toEqual({ present: 1, late: 1, absentExcused: 1, absent: 0, injured: 0, notRecorded: 1, total: 4, attended: 2, rate: 2 / 3 });
    });

    it('injured is an outcome like the others, no injury needed, and it leaves the rate out', async () => {
      const s = await club('at-01b@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'present');
      await mark(s.coach1.token, ev.id, s.mate.enrollmentId, 'injured');
      await mark(s.coach1.token, ev.id, s.trainer.enrollmentId, 'absent');
      const v = await view(s.coach1.token, ev.id);
      expect(row(v.rows, s.mate.enrollmentId)).toMatchObject({ outcome: 'injured', type: 'player' });
      expect(v.summary).toMatchObject({ present: 1, absent: 1, injured: 1, attended: 1, notRecorded: 1, total: 4, rate: 0.5 });
    });

    it('marking again replaces the outcome and clearing removes the row', async () => {
      const s = await club('at-02@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'absent');
      expect((await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'present')).body.outcome).toBe('present');
      expect((await send(s.coach1.token, 'DELETE', `/events/${ev.id}/attendance/${s.player.enrollmentId}`)).status).toBe(204);
      const v = await view(s.coach1.token, ev.id);
      expect(row(v.rows, s.player.enrollmentId).outcome).toBeNull();
    });

    it('an outcome outside the closed list is invalid data, and there is no free note', async () => {
      const s = await club('at-03@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      const bad = await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'sick');
      expect([bad.status, bad.body.code]).toEqual([400, 'INVALID_DATA']);
      const note = await send(s.coach1.token, 'PUT', `/events/${ev.id}/attendance/${s.player.enrollmentId}`, { outcome: 'present', note: 'flu' });
      expect([note.status, note.body.code]).toEqual([400, 'INVALID_DATA']);
    });

    it('the check opens 30 minutes before the start: a later event is refused, one inside the window works', async () => {
      const s = await club('at-04c@test.it');
      const at = (minutes: number) => {
        const start = new Date(Date.now() + minutes * 60_000);
        return { start: start.toISOString(), end: new Date(start.getTime() + 90 * 60_000).toISOString() };
      };
      const later = await s.event(s.t1.teamId, 0, at(45));
      const early = await mark(s.coach1.token, later.id, s.player.enrollmentId, 'present');
      expect([early.status, early.body.code]).toEqual([409, 'ATTENDANCE_NOT_OPEN']);
      const soon = await s.event(s.t1.teamId, 0, at(20));
      expect((await mark(s.coach1.token, soon.id, s.player.enrollmentId, 'present')).status).toBe(200);
      expect((await send(s.coach1.token, 'DELETE', `/events/${soon.id}/attendance/${s.player.enrollmentId}`)).status).toBe(204);
    });

    it('an event that did not start yet, a cancelled one and a postponed one are refused', async () => {
      const s = await club('at-04@test.it');
      const future = await s.event(s.t1.teamId, 5);
      const r1 = await mark(s.coach1.token, future.id, s.player.enrollmentId, 'present');
      expect([r1.status, r1.body.code]).toEqual([409, 'ATTENDANCE_NOT_OPEN']);
      for (const action of ['cancel', 'postpone']) {
        const ev = await s.event(s.t1.teamId, -2);
        const ch = await send(s.admin, 'POST', `/events/${ev.id}/${action}`, action === 'postpone' ? {} : undefined);
        expect(ch.status).toBeLessThan(300);
        const r = await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'present');
        expect([r.status, r.body.code]).toEqual([409, 'EVENT_NOT_RECORDABLE']);
      }
    });

    it('a person of another team or another club is a 404', async () => {
      const s = await club('at-05@test.it');
      const other = await club('at-05b@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      const x = await mark(s.coach1.token, ev.id, s.coach2.enrollmentId, 'present');
      expect([x.status, x.body.code]).toEqual([404, 'ENROLLMENT_NOT_FOUND']);
      const y = await mark(other.coach1.token, ev.id, s.player.enrollmentId, 'present');
      expect([y.status, y.body.code]).toEqual([404, 'EVENT_NOT_FOUND']);
    });

    it('a closed season is read only', async () => {
      const s = await club('at-06@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'present');
      expect((await send(s.admin, 'POST', `/seasons/${s.t1.seasonId}/close`)).status).toBe(200);
      // The admin holds every policy, so the season state is what refuses. The coach lost the policy with the season.
      const w = await mark(s.admin, ev.id, s.player.enrollmentId, 'absent');
      expect([w.status, w.body.code]).toEqual([409, 'SEASON_CLOSED']);
      const d = await send(s.admin, 'DELETE', `/events/${ev.id}/attendance/${s.player.enrollmentId}`);
      expect([d.status, d.body.code]).toEqual([409, 'SEASON_CLOSED']);
      expect((await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'absent')).status).toBeGreaterThanOrEqual(400);
      // The staff keep reading the history (rule 7).
      const v = await view(s.coach1.token, ev.id);
      expect(v.canRecord).toBe(false);
      expect(row(v.rows, s.player.enrollmentId).outcome).toBe('present');
    });
  });

  describe('who may do what', () => {
    it('the trainer records (policy attendances.record), a coach of another team does not', async () => {
      const s = await club('at-10@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      expect((await mark(s.trainer.token, ev.id, s.player.enrollmentId, 'present')).status).toBe(200);
      const x = await mark(s.coach2.token, ev.id, s.player.enrollmentId, 'present');
      expect([x.status, x.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      expect((await send(s.coach2.token, 'GET', `/events/${ev.id}/attendance`)).status).toBe(403);
    });

    it('a manager without the policy is refused on every write and sees statistics only', async () => {
      const s = await club('at-11@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'present');
      await mark(s.coach1.token, ev.id, s.mate.enrollmentId, 'absent');
      const m = await s.manager('mg');
      const w = await mark(m.token, ev.id, s.player.enrollmentId, 'absent');
      expect([w.status, w.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      expect((await send(m.token, 'DELETE', `/events/${ev.id}/attendance/${s.player.enrollmentId}`)).status).toBe(403);
      const v = await view(m.token, ev.id);
      expect(v.view).toBe('stats');
      expect(v.rows).toBeUndefined();
      expect(v.summary).toMatchObject({ present: 1, absent: 1, attended: 1, rate: 0.5 });
    });

    it('a player cannot record, not even for themselves', async () => {
      const s = await club('at-12@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      const w = await mark(s.player.token, ev.id, s.player.enrollmentId, 'present');
      expect([w.status, w.body.code]).toEqual([403, 'PERMISSION_DENIED']);
    });

    it('a person with no tie to the team reads nothing', async () => {
      const s = await club('at-13@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      const outsider = await t.newUser('at-13x@test.it');
      expect((await send(outsider.accessToken, 'GET', `/events/${ev.id}/attendance`)).status).toBe(403);
    });
  });

  describe('what a player sees', () => {
    it('their own result and the staff present, never the other players', async () => {
      const s = await club('at-20@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'late');
      await mark(s.coach1.token, ev.id, s.mate.enrollmentId, 'absent');
      await mark(s.coach1.token, ev.id, s.coach1.enrollmentId, 'present');
      await mark(s.coach1.token, ev.id, s.trainer.enrollmentId, 'absent');
      const v = await view(s.player.token, ev.id);
      expect(v.view).toBe('player');
      expect(v.mine).toMatchObject({ enrollmentId: s.player.enrollmentId, outcome: 'late' });
      expect(v.staffPresent.map((x: { enrollmentId: string }) => x.enrollmentId)).toEqual([s.coach1.enrollmentId]);
      expect(v.rows).toBeUndefined();
      expect(v.summary).toBeUndefined();
      expect(JSON.stringify(v)).not.toContain(s.mate.enrollmentId);
    });

    it('an injured mate is never shown to a player: only the own result is', async () => {
      const s = await club('at-20b@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      await mark(s.coach1.token, ev.id, s.mate.enrollmentId, 'injured');
      await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'injured');
      const v = await view(s.player.token, ev.id);
      expect(v.mine).toMatchObject({ outcome: 'injured' });
      expect(JSON.stringify(v)).not.toContain(s.mate.enrollmentId);
      expect(v.summary).toBeUndefined();
    });

    it('a player not yet marked sees no outcome', async () => {
      const s = await club('at-21@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      const v = await view(s.player.token, ev.id);
      expect(v.mine.outcome).toBeNull();
      expect(v.staffPresent).toEqual([]);
    });
  });

  describe('disabled people (rule 12)', () => {
    it('the row stays for the totals as a disabled person, and only the admin sees the name', async () => {
      const s = await club('at-30@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'present');
      await mark(s.coach1.token, ev.id, s.mate.enrollmentId, 'present');
      expect((await send(s.admin, 'POST', `/people/${s.player.personId}/disable`)).status).toBe(200);

      const staff = await view(s.coach1.token, ev.id);
      expect(row(staff.rows, s.player.enrollmentId)).toMatchObject({ name: null, surname: null, disabled: true, outcome: 'present' });
      expect(staff.summary.present).toBe(2);

      const admin = await view(s.admin, ev.id);
      expect(row(admin.rows, s.player.enrollmentId)).toMatchObject({ name: 'p1', disabled: true });
    });

    it('a disabled person who was not marked disappears from the screen and cannot be marked', async () => {
      const s = await club('at-31@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      expect((await send(s.admin, 'POST', `/people/${s.mate.personId}/disable`)).status).toBe(200);
      const v = await view(s.coach1.token, ev.id);
      expect(row(v.rows, s.mate.enrollmentId)).toBeUndefined();
      expect(v.summary.total).toBe(3);
      const w = await mark(s.coach1.token, ev.id, s.mate.enrollmentId, 'present');
      expect([w.status, w.body.code]).toEqual([404, 'ENROLLMENT_NOT_FOUND']);
    });
  });

  describe('audit', () => {
    it('every change of a row is audited with the outcomes and nothing else, and a repeated one is not', async () => {
      const s = await club('at-40@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'absent');
      await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'absent');
      await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'present');
      await send(s.coach1.token, 'DELETE', `/events/${ev.id}/attendance/${s.player.enrollmentId}`);
      const log = await t.orm.em.fork().find(AuditLog, { entity: 'attendance' },{ filters: false, orderBy: { createdAt: 'asc' } });
      const mine = log.filter((l) => (l.meta as { eventId?: string })?.eventId === ev.id);
      expect(mine.map((l) => l.action)).toEqual(['attendance_recorded', 'attendance_modified', 'attendance_cleared']);
      expect(mine[0]?.meta).toEqual({ eventId: ev.id, enrollmentId: s.player.enrollmentId, from: null, to: 'absent' });
      expect(mine[1]?.meta).toEqual({ eventId: ev.id, enrollmentId: s.player.enrollmentId, from: 'absent', to: 'present' });
      expect(mine[2]?.meta).toEqual({ eventId: ev.id, enrollmentId: s.player.enrollmentId, from: 'present', to: null });
      expect(mine[0]?.user?.id).toBe(s.coach1.userId);
    });

    it('a refused request writes no audit', async () => {
      const s = await club('at-41@test.it');
      const ev = await s.event(s.t1.teamId, -3);
      await mark(s.player.token, ev.id, s.player.enrollmentId, 'present');
      await mark(s.coach1.token, ev.id, s.player.enrollmentId, 'sick');
      const log = await t.orm.em.fork().find(AuditLog, { entity: 'attendance' }, { filters: false });
      expect(log.filter((l) => (l.meta as { eventId?: string })?.eventId === ev.id)).toEqual([]);
    });
  });
});
