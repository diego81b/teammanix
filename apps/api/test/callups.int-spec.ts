import { Callup } from '../src/entities/callup.entity';
import { Enrollment } from '../src/entities/enrollment.entity';
import { CallupResponse } from '../src/entities/enums';
import { Event } from '../src/entities/event.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment, createTeams, roleId } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const slot = (offset = 30, from = '16:00', to = '17:30') => ({ start: `${day(offset)}T${from}:00Z`, end: `${day(offset)}T${to}:00Z` });

describe('call-ups: three lists per event', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
    const em = t.orm.em.fork();
    em.create(SportProfile, { code: 'football', positions: ['goalkeeper'], starterBench: true, maxStarters: 11, modulesAvailable: ['attendances'] } as never);
    em.create(SportProfile, { code: 'fencing', positions: [], starterBench: false, modulesAvailable: [] } as never);
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
   * Club with T1 and T2 (active seasons around today), coaches, an assistant coach and a trainer of T1, a coach of T2,
   * a player with an account and `extra` players without one. All players start with a valid certificate.
   */
  async function club(email: string, sport = 'football') {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    const admin = c.body.accessToken as string;
    const struct = await createTeams(t.req, admin, { sportProfile: sport });
    const team = async (name: string) => {
      const sq = await struct.team(name);
      const st = await post(admin, `/teams/${sq.id}/seasons`, { name: 'Now', startDate: day(-60), endDate: day(400) });
      return { teamId: sq.id as string, seasonId: st.id as string };
    };
    const t1 = await team('T1');
    const t2 = await team('T2');
    const person = async (tag: string) => post(admin, '/people', { name: tag, surname: 'Rossi', birthDate: '1990-01-01', email: `${tag}-${email}` });
    const certify = async (personId: string, expiryDate = day(365)) =>
      post(admin, `/people/${personId}/certificates`, { type: 'competitive', issueDate: day(-10), expiryDate });
    const enroll = async (seasonId: string, personId: string, type: 'player' | 'staff', staffRole?: string) =>
      post(admin, `/seasons/${seasonId}/enrollments`, { personId, type, ...(staffRole ? { staffRoleId: await roleId(t.req, admin, staffRole) } : {}) });
    const withAccount = async (seasonId: string, tag: string, type: 'player' | 'staff', staffRole?: string) => {
      const p = await person(tag);
      const enrollment = await enroll(seasonId, p.id, type, staffRole);
      await post(admin, '/invitations', { email: `${tag}-${email}`, role: type, personId: p.id });
      if (type === 'player') await certify(p.id);
      return { ...(await accept(`${tag}-${email}`)), personId: p.id as string, enrollmentId: enrollment.id as string };
    };
    /** A player of T1 without an account, with a valid certificate. */
    const roster = async (tag: string, seasonId = t1.seasonId, certificate: string | null = day(365)) => {
      const p = await person(tag);
      const enrollment = await enroll(seasonId, p.id, 'player');
      if (certificate) await certify(p.id, certificate);
      return { personId: p.id as string, enrollmentId: enrollment.id as string };
    };
    const coach1 = await withAccount(t1.seasonId, 'c1', 'staff', 'coach');
    const assistant = await withAccount(t1.seasonId, 'as', 'staff', 'assistant_coach');
    const trainer = await withAccount(t1.seasonId, 'tr', 'staff', 'trainer');
    const coach2 = await withAccount(t2.seasonId, 'c2', 'staff', 'coach');
    const player = await withAccount(t1.seasonId, 'p1', 'player');
    for (const x of [t1, t2]) expect((await t.req('POST', `/seasons/${x.seasonId}/active`, { token: admin })).status).toBe(200);
    const event = async (teamId: string, over: object = {}, token = admin) => post(token, `/teams/${teamId}/events`, { type: 'training', ...slot(), ...over });
    return { admin, t1, t2, coach1, assistant, trainer, coach2, player, roster, person, enroll, certify, event, email };
  }

  const lists = async (token: string, eventId: string) => {
    const r = await send(token, 'GET', `/events/${eventId}/callups`);
    expect(r.status).toBe(200);
    return r.body;
  };
  const ids = (rows: { enrollmentId: string }[]) => rows.map((r) => r.enrollmentId).sort();
  const callUp = (token: string, eventId: string, enrollmentId: string, extra: object = {}) =>
    send(token, 'POST', `/events/${eventId}/callups`, { enrollmentId, ...extra });
  const setting = (admin: string, blockCertificateExpired: boolean) =>
    t.req('PATCH', '/club/current/settings', { token: admin, body: { blockCertificateExpired } });

  describe('the three lists', () => {
    it('every person of the roster is in exactly one list', async () => {
      const s = await club('cu-1@test.it');
      const ev = await s.event(s.t1.teamId);
      const fit = await s.roster('fit');
      const hurt = await s.roster('hurt');
      expect((await send(s.admin, 'PATCH', `/enrollments/${hurt.enrollmentId}`, { status: 'injured' })).status).toBe(200);
      const noCertificate = await s.roster('nocert', s.t1.seasonId, null);
      const called = await s.roster('called');
      expect((await callUp(s.coach1.token, ev.id, called.enrollmentId)).status).toBe(201);

      const l = await lists(s.coach1.token, ev.id);
      expect(ids(l.calledUp)).toEqual([called.enrollmentId]);
      expect(l.event).toMatchObject({ id: ev.id, teamId: s.t1.teamId, type: 'training' });
      expect(ids(l.callable)).toEqual(ids([fit, s.player]));
      expect(ids(l.notCallable)).toEqual(ids([hurt, noCertificate]));
      const all = [...l.calledUp, ...l.callable, ...l.notCallable];
      expect(new Set(all.map((r: { enrollmentId: string }) => r.enrollmentId)).size).toBe(all.length);
    });

    it('not callable rows say why', async () => {
      const s = await club('cu-2@test.it');
      const ev = await s.event(s.t1.teamId);
      const hurt = await s.roster('hurt');
      await send(s.admin, 'PATCH', `/enrollments/${hurt.enrollmentId}`, { status: 'injured' });
      const noCertificate = await s.roster('nocert', s.t1.seasonId, null);
      const expired = await s.roster('expired', s.t1.seasonId, day(-1));
      const l = await lists(s.coach1.token, ev.id);
      const reasons = (id: string) => l.notCallable.find((r: { enrollmentId: string }) => r.enrollmentId === id)?.reasons;
      expect(reasons(hurt.enrollmentId)).toEqual([{ code: 'injured', severity: 'hard' }]);
      expect(reasons(noCertificate.enrollmentId)).toEqual([{ code: 'certificate_missing', severity: 'hard' }]);
      expect(reasons(expired.enrollmentId)).toEqual([{ code: 'certificate_expired', severity: 'hard' }]);
    });

    it('disabled people, closed enrollments and staff appear in no list', async () => {
      const s = await club('cu-3@test.it');
      const ev = await s.event(s.t1.teamId);
      const disabled = await s.roster('disabled');
      const closed = await s.roster('closed');
      expect((await t.req('POST', `/people/${disabled.personId}/disable`, { token: s.admin })).status).toBe(200);
      expect((await t.req('POST', `/enrollments/${closed.enrollmentId}/close`, { token: s.admin })).status).toBe(200);
      const l = await lists(s.coach1.token, ev.id);
      const everyone = ids([...l.calledUp, ...l.callable, ...l.notCallable]);
      expect(everyone).toEqual(ids([s.player]));
    });

    it('a person called up and then disabled or closed leaves the called up list too', async () => {
      const s = await club('cu-4@test.it');
      const ev = await s.event(s.t1.teamId);
      const a = await s.roster('a');
      const b = await s.roster('b');
      await callUp(s.coach1.token, ev.id, a.enrollmentId);
      await callUp(s.coach1.token, ev.id, b.enrollmentId);
      await t.req('POST', `/people/${a.personId}/disable`, { token: s.admin });
      await t.req('POST', `/enrollments/${b.enrollmentId}/close`, { token: s.admin });
      expect((await lists(s.coach1.token, ev.id)).calledUp).toEqual([]);
    });
  });

  describe('calling up', () => {
    it('a fit player is called up and shows in the called up list as pending', async () => {
      const s = await club('cu-10@test.it');
      const ev = await s.event(s.t1.teamId);
      const p = await s.roster('p');
      const r = await callUp(s.coach1.token, ev.id, p.enrollmentId);
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ enrollmentId: p.enrollmentId, response: 'pending', placement: null });
      const l = await lists(s.coach1.token, ev.id);
      expect(l.calledUp[0]).toMatchObject({ enrollmentId: p.enrollmentId, name: 'p', response: 'pending', reasons: [] });
    });

    it('an expired certificate with a club that blocks is refused', async () => {
      const s = await club('cu-11@test.it');
      const ev = await s.event(s.t1.teamId);
      const p = await s.roster('p', s.t1.seasonId, day(-1));
      const r = await callUp(s.coach1.token, ev.id, p.enrollmentId);
      expect([r.status, r.body.code]).toEqual([409, 'ENROLLMENT_NOT_CALLABLE']);
      expect(r.body.reasons).toEqual(['certificate_expired']);
      expect((await lists(s.coach1.token, ev.id)).calledUp).toEqual([]);
    });

    it('an expired certificate with a club that warns is accepted and shows the warning', async () => {
      const s = await club('cu-12@test.it');
      expect((await setting(s.admin, false)).status).toBe(200);
      const ev = await s.event(s.t1.teamId);
      const p = await s.roster('p', s.t1.seasonId, day(-1));
      expect((await callUp(s.coach1.token, ev.id, p.enrollmentId)).status).toBe(201);
      const l = await lists(s.coach1.token, ev.id);
      expect(l.calledUp[0].reasons).toEqual([{ code: 'certificate_expired', severity: 'warning' }]);
      expect(l.blockCertificate).toBe(false);
    });

    it('with a club that warns, the expired player is callable, not blocked', async () => {
      const s = await club('cu-13@test.it');
      await setting(s.admin, false);
      const ev = await s.event(s.t1.teamId);
      const p = await s.roster('p', s.t1.seasonId, day(-1));
      const l = await lists(s.coach1.token, ev.id);
      expect(ids(l.callable)).toContain(p.enrollmentId);
      expect(ids(l.notCallable)).not.toContain(p.enrollmentId);
    });

    it('an expiring certificate only warns, even when the club blocks', async () => {
      const s = await club('cu-14@test.it');
      const ev = await s.event(s.t1.teamId);
      const p = await s.roster('p', s.t1.seasonId, day(40));
      expect((await callUp(s.coach1.token, ev.id, p.enrollmentId)).status).toBe(201);
      expect((await lists(s.coach1.token, ev.id)).calledUp[0].reasons).toEqual([{ code: 'certificate_expiring', severity: 'warning' }]);
    });

    it('the certificate counts on the day of the event, not today', async () => {
      const s = await club('cu-15@test.it');
      const later = await s.event(s.t1.teamId, slot(120));
      const soon = await s.event(s.t1.teamId, slot(30));
      // Valid today and for 60 days, expired by the second event.
      const p = await s.roster('p', s.t1.seasonId, day(60));
      expect(ids((await lists(s.coach1.token, soon.id)).callable)).toContain(p.enrollmentId);
      expect(ids((await lists(s.coach1.token, later.id)).notCallable)).toContain(p.enrollmentId);
      const r = await callUp(s.coach1.token, later.id, p.enrollmentId);
      expect([r.status, r.body.code]).toEqual([409, 'ENROLLMENT_NOT_CALLABLE']);
    });

    it('an injured player is refused and nothing forces it', async () => {
      const s = await club('cu-16@test.it');
      const ev = await s.event(s.t1.teamId);
      const p = await s.roster('p');
      await send(s.admin, 'PATCH', `/enrollments/${p.enrollmentId}`, { status: 'injured' });
      const r = await callUp(s.coach1.token, ev.id, p.enrollmentId, { confirm: true });
      expect([r.status, r.body.code]).toEqual([409, 'ENROLLMENT_NOT_CALLABLE']);
    });

    it('calling up twice is a conflict', async () => {
      const s = await club('cu-17@test.it');
      const ev = await s.event(s.t1.teamId);
      const p = await s.roster('p');
      await callUp(s.coach1.token, ev.id, p.enrollmentId);
      const r = await callUp(s.coach1.token, ev.id, p.enrollmentId);
      expect([r.status, r.body.code]).toEqual([409, 'CALLUP_EXISTS']);
    });

    it('a staff member, a person of another season or a missing enrollment cannot be called up', async () => {
      const s = await club('cu-18@test.it');
      const ev = await s.event(s.t1.teamId);
      const other = await s.roster('other', s.t2.seasonId);
      for (const enrollmentId of [s.coach1.enrollmentId, other.enrollmentId, '00000000-0000-4000-8000-000000000000']) {
        const r = await callUp(s.coach1.token, ev.id, enrollmentId);
        expect([r.status, r.body.code]).toEqual([404, 'ENROLLMENT_NOT_FOUND']);
      }
    });

    it('removing a call-up puts the player back among the callable', async () => {
      const s = await club('cu-19@test.it');
      const ev = await s.event(s.t1.teamId);
      const p = await s.roster('p');
      await callUp(s.coach1.token, ev.id, p.enrollmentId);
      expect((await send(s.coach1.token, 'DELETE', `/events/${ev.id}/callups/${p.enrollmentId}`)).status).toBe(204);
      const l = await lists(s.coach1.token, ev.id);
      expect(l.calledUp).toEqual([]);
      expect(ids(l.callable)).toContain(p.enrollmentId);
      const again = await send(s.coach1.token, 'DELETE', `/events/${ev.id}/callups/${p.enrollmentId}`);
      expect([again.status, again.body.code]).toEqual([404, 'CALLUP_NOT_FOUND']);
    });

    it('a cancelled event, or one of a closed season, cannot be changed; the lists stay readable', async () => {
      const s = await club('cu-20@test.it');
      const cancelled = await s.event(s.t1.teamId);
      const p = await s.roster('p');
      await callUp(s.coach1.token, cancelled.id, p.enrollmentId);
      await t.req('POST', `/events/${cancelled.id}/cancel`, { token: s.admin });
      const r = await callUp(s.coach1.token, cancelled.id, s.player.enrollmentId);
      expect([r.status, r.body.code]).toEqual([409, 'EVENT_NOT_EDITABLE']);
      expect(ids((await lists(s.coach1.token, cancelled.id)).calledUp)).toEqual([p.enrollmentId]);

      const open = await s.event(s.t1.teamId);
      await t.req('POST', `/seasons/${s.t1.seasonId}/close`, { token: s.admin });
      const closed = await callUp(s.admin, open.id, p.enrollmentId);
      expect([closed.status, closed.body.code]).toEqual([409, 'SEASON_CLOSED']);
    });
  });

  describe('sending', () => {
    it('sending reaches only the people called up since the last send', async () => {
      const s = await club('cu-30@test.it');
      const ev = await s.event(s.t1.teamId);
      const a = await s.roster('a');
      const b = await s.roster('b');
      await callUp(s.coach1.token, ev.id, a.enrollmentId);
      const first = await send(s.coach1.token, 'POST', `/events/${ev.id}/callups/send`);
      expect([first.status, ids(first.body.notified)]).toEqual([200, [a.enrollmentId]]);

      await callUp(s.coach1.token, ev.id, b.enrollmentId);
      const second = await send(s.coach1.token, 'POST', `/events/${ev.id}/callups/send`);
      expect(ids(second.body.notified)).toEqual([b.enrollmentId]);

      const third = await send(s.coach1.token, 'POST', `/events/${ev.id}/callups/send`);
      expect(third.body.notified).toEqual([]);
    });

    it('a removed and called up again player counts as new', async () => {
      const s = await club('cu-31@test.it');
      const ev = await s.event(s.t1.teamId);
      const a = await s.roster('a');
      await callUp(s.coach1.token, ev.id, a.enrollmentId);
      await send(s.coach1.token, 'POST', `/events/${ev.id}/callups/send`);
      await send(s.coach1.token, 'DELETE', `/events/${ev.id}/callups/${a.enrollmentId}`);
      await callUp(s.coach1.token, ev.id, a.enrollmentId);
      expect(ids((await send(s.coach1.token, 'POST', `/events/${ev.id}/callups/send`)).body.notified)).toEqual([a.enrollmentId]);
    });
  });

  describe('starter or bench', () => {
    it('the coach marks a player as starter and it shows in the lists', async () => {
      const s = await club('cu-40@test.it');
      const ev = await s.event(s.t1.teamId);
      const p = await s.roster('p');
      await callUp(s.coach1.token, ev.id, p.enrollmentId);
      const r = await send(s.coach1.token, 'PATCH', `/events/${ev.id}/callups/${p.enrollmentId}`, { placement: 'starter' });
      expect([r.status, r.body.placement]).toEqual([200, 'starter']);
      const l = await lists(s.coach1.token, ev.id);
      expect(l.starterBench).toBe(true);
      expect(l.calledUp[0].placement).toBe('starter');
      const cleared = await send(s.coach1.token, 'PATCH', `/events/${ev.id}/callups/${p.enrollmentId}`, { placement: null });
      expect(cleared.body.placement).toBeNull();
    });

    it('a sport without starters and bench refuses the mark', async () => {
      const s = await club('cu-41@test.it', 'fencing');
      const ev = await s.event(s.t1.teamId);
      const p = await s.roster('p');
      await callUp(s.coach1.token, ev.id, p.enrollmentId);
      const r = await send(s.coach1.token, 'PATCH', `/events/${ev.id}/callups/${p.enrollmentId}`, { placement: 'starter' });
      expect([r.status, r.body.code]).toEqual([400, 'PLACEMENT_NOT_ALLOWED']);
      expect((await lists(s.coach1.token, ev.id)).starterBench).toBe(false);
    });

    it('a mark on a player who is not called up is a 404, a wrong value is invalid data', async () => {
      const s = await club('cu-42@test.it');
      const ev = await s.event(s.t1.teamId);
      const p = await s.roster('p');
      const missing = await send(s.coach1.token, 'PATCH', `/events/${ev.id}/callups/${p.enrollmentId}`, { placement: 'bench' });
      expect([missing.status, missing.body.code]).toEqual([404, 'CALLUP_NOT_FOUND']);
      await callUp(s.coach1.token, ev.id, p.enrollmentId);
      const wrong = await send(s.coach1.token, 'PATCH', `/events/${ev.id}/callups/${p.enrollmentId}`, { placement: 'goalkeeper' });
      expect([wrong.status, wrong.body.code]).toEqual([400, 'INVALID_DATA']);
      const empty = await send(s.coach1.token, 'PATCH', `/events/${ev.id}/callups/${p.enrollmentId}`, {});
      expect([empty.status, empty.body.code]).toEqual([400, 'INVALID_DATA']);
    });
  });

  describe('overlap', () => {
    it('warns when the person has another event at the same time, without saying which', async () => {
      const s = await club('cu-50@test.it');
      const first = await s.event(s.t1.teamId, slot(30, '16:00', '17:30'));
      const second = await s.event(s.t1.teamId, slot(30, '17:00', '18:30'));
      const p = await s.roster('p');
      await callUp(s.coach1.token, first.id, p.enrollmentId);
      const l = await lists(s.coach1.token, second.id);
      const row = l.callable.find((r: { enrollmentId: string }) => r.enrollmentId === p.enrollmentId);
      expect(row.reasons).toEqual([{ code: 'busy_elsewhere', severity: 'warning' }]);
      expect(JSON.stringify(row)).not.toContain(first.id);
      expect((await callUp(s.coach1.token, second.id, p.enrollmentId)).status).toBe(201);
    });

    it('catches an event of another team of the same club, and ignores back to back and cancelled ones', async () => {
      const s = await club('cu-51@test.it');
      const own = await s.event(s.t1.teamId, slot(30, '16:00', '17:30'));
      const other = await s.event(s.t2.teamId, slot(30, '16:30', '18:00'), s.admin);
      const adjacent = await s.event(s.t2.teamId, slot(30, '17:30', '19:00'), s.admin);
      const cancelled = await s.event(s.t2.teamId, slot(30, '16:00', '17:00'), s.admin);
      const p = await s.person('multi');
      await s.certify(p.id);
      const e1 = await s.enroll(s.t1.seasonId, p.id, 'player');
      const e2 = await s.enroll(s.t2.seasonId, p.id, 'player');
      await callUp(s.admin, other.id, e2.id);
      await callUp(s.admin, adjacent.id, e2.id);
      await callUp(s.admin, cancelled.id, e2.id);
      await t.req('POST', `/events/${cancelled.id}/cancel`, { token: s.admin });
      const row = (await lists(s.coach1.token, own.id)).callable.find((r: { enrollmentId: string }) => r.enrollmentId === e1.id);
      expect(row.reasons).toEqual([{ code: 'busy_elsewhere', severity: 'warning' }]);

      // Without the overlapping event only the back to back one is left: no warning.
      await send(s.admin, 'DELETE', `/events/${other.id}/callups/${e2.id}`);
      const clean = (await lists(s.coach1.token, own.id)).callable.find((r: { enrollmentId: string }) => r.enrollmentId === e1.id);
      expect(clean.reasons).toEqual([]);
    });

    /** Writes a response row straight into the DB: the API that creates it (staff availability, declining) comes later. */
    async function answer(eventId: string, enrollmentId: string, response: CallupResponse) {
      const em = t.orm.em.fork();
      const event = await em.findOneOrFail(Event, { id: eventId }, { filters: false });
      em.create(Callup, { club: event.club, event, enrollment: em.getReference(Enrollment, enrollmentId), response } as never);
      await em.flush();
    }

    it('a player who declined the other event is not busy there', async () => {
      const s = await club('cu-52@test.it');
      const own = await s.event(s.t1.teamId, slot(30, '16:00', '17:30'));
      const other = await s.event(s.t2.teamId, slot(30, '16:30', '18:00'), s.admin);
      const p = await s.person('decl');
      await s.certify(p.id);
      const e1 = await s.enroll(s.t1.seasonId, p.id, 'player');
      const e2 = await s.enroll(s.t2.seasonId, p.id, 'player');
      await answer(other.id, e2.id, CallupResponse.DECLINED);
      const row = (await lists(s.coach1.token, own.id)).callable.find((r: { enrollmentId: string }) => r.enrollmentId === e1.id);
      expect(row.reasons).toEqual([]);
    });

    it('staff availability of the same person does not make the player busy', async () => {
      const s = await club('cu-53@test.it');
      const own = await s.event(s.t1.teamId, slot(30, '16:00', '17:30'));
      const other = await s.event(s.t2.teamId, slot(30, '16:30', '18:00'), s.admin);
      const p = await s.person('both');
      await s.certify(p.id);
      const asPlayer = await s.enroll(s.t1.seasonId, p.id, 'player');
      const asStaff = await s.enroll(s.t2.seasonId, p.id, 'staff', 'coach');
      await answer(other.id, asStaff.id, CallupResponse.CONFIRMED);
      const row = (await lists(s.coach1.token, own.id)).callable.find((r: { enrollmentId: string }) => r.enrollmentId === asPlayer.id);
      expect(row.reasons).toEqual([]);
    });
  });

  describe('who sees and who writes', () => {
    it('the player sees only who is called up, with no marks, reasons or warnings', async () => {
      const s = await club('cu-60@test.it');
      const ev = await s.event(s.t1.teamId);
      const a = await s.roster('a', s.t1.seasonId, day(40));
      const hurt = await s.roster('hurt');
      await send(s.admin, 'PATCH', `/enrollments/${hurt.enrollmentId}`, { status: 'injured' });
      await callUp(s.coach1.token, ev.id, a.enrollmentId);
      await send(s.coach1.token, 'PATCH', `/events/${ev.id}/callups/${a.enrollmentId}`, { placement: 'starter' });
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);

      const r = await send(s.player.token, 'GET', `/events/${ev.id}/callups`);
      expect(r.status).toBe(200);
      expect(r.body.view).toBe('player');
      expect(r.body.event).toMatchObject({ id: ev.id, teamId: s.t1.teamId });
      expect(r.body.iAmCalledUp).toBe(true);
      expect(ids(r.body.calledUp)).toEqual(ids([a, s.player]));
      expect(r.body.calledUp.find((x: { mine: boolean }) => x.mine).enrollmentId).toBe(s.player.enrollmentId);
      const json = JSON.stringify(r.body);
      for (const key of ['placement', 'reasons', 'severity', 'callable', 'notCallable', 'injured', 'certificate', 'starterBench', 'blockCertificate']) {
        expect(json).not.toContain(key);
      }
      expect(json).not.toContain(hurt.enrollmentId);
    });

    it('a player who is not called up is told so and sees nobody else\'s reasons', async () => {
      const s = await club('cu-61@test.it');
      const ev = await s.event(s.t1.teamId);
      const a = await s.roster('a');
      await callUp(s.coach1.token, ev.id, a.enrollmentId);
      const r = await send(s.player.token, 'GET', `/events/${ev.id}/callups`);
      expect(r.body.iAmCalledUp).toBe(false);
      expect(ids(r.body.calledUp)).toEqual([a.enrollmentId]);
    });

    it('a person who is staff and player of the season gets their own call-up in the staff view, separate from the availability (#15)', async () => {
      const s = await club('cu-86@test.it');
      const ev = await s.event(s.t1.teamId);
      const dual = await s.person('dual');
      const staffEnrollment = await s.enroll(s.t1.seasonId, dual.id, 'staff', 'trainer');
      const playerEnrollment = await s.enroll(s.t1.seasonId, dual.id, 'player');
      await s.certify(dual.id);
      await post(s.admin, '/invitations', { email: `dual-${s.email}`, role: 'staff', personId: dual.id });
      const me = await accept(`dual-${s.email}`);

      const before = await lists(me.token, ev.id);
      expect(before.view).toBe('read');
      expect(before.ownCallup).toBeNull();

      expect((await callUp(s.coach1.token, ev.id, playerEnrollment.id)).status).toBe(201);
      expect((await lists(me.token, ev.id)).ownCallup).toEqual({ enrollmentId: playerEnrollment.id, response: 'pending' });

      expect((await send(me.token, 'PUT', `/events/${ev.id}/callups/me`, { response: 'confirmed' })).status).toBe(200);
      const after = await lists(me.token, ev.id);
      expect(after.ownCallup).toEqual({ enrollmentId: playerEnrollment.id, response: 'confirmed' });
      const own = after.staff.find((x: { enrollmentId: string }) => x.enrollmentId === staffEnrollment.id);
      expect(own.response).toBeNull();

      expect((await send(me.token, 'PUT', `/events/${ev.id}/availability/me`, { response: 'declined' })).status).toBe(200);
      expect((await lists(me.token, ev.id)).ownCallup).toEqual({ enrollmentId: playerEnrollment.id, response: 'confirmed' });
    });

    it('someone who is only staff has no own call-up, and a player-only view is unchanged', async () => {
      const s = await club('cu-87@test.it');
      const ev = await s.event(s.t1.teamId);
      expect((await lists(s.coach1.token, ev.id)).ownCallup).toBeNull();
      expect(Object.keys((await send(s.player.token, 'GET', `/events/${ev.id}/callups`)).body)).not.toContain('ownCallup');
    });

    it('staff of the team reads all the lists, the coach of another team and the player of another team do not', async () => {
      const s = await club('cu-62@test.it');
      const ev = await s.event(s.t1.teamId);
      expect((await lists(s.trainer.token, ev.id)).view).toBe('read');
      expect((await lists(s.coach1.token, ev.id)).view).toBe('manage');
      const other = await send(s.coach2.token, 'GET', `/events/${ev.id}/callups`);
      expect([other.status, other.body.code]).toEqual([403, 'PERMISSION_DENIED']);
    });

    it('the coach and the assistant coach write, the trainer, the player and the coach of another team do not', async () => {
      const s = await club('cu-63@test.it');
      const ev = await s.event(s.t1.teamId);
      const a = await s.roster('a');
      const b = await s.roster('b');
      for (const who of [s.trainer, s.player, s.coach2]) {
        const r = await callUp(who.token, ev.id, a.enrollmentId);
        expect([r.status, r.body.code]).toEqual([403, 'PERMISSION_DENIED']);
        expect((await send(who.token, 'POST', `/events/${ev.id}/callups/send`)).status).toBe(403);
      }
      expect((await callUp(s.assistant.token, ev.id, a.enrollmentId)).status).toBe(201);
      expect((await callUp(s.coach1.token, ev.id, b.enrollmentId)).status).toBe(201);
      expect((await callUp(s.admin, ev.id, s.player.enrollmentId)).status).toBe(201);
      const del = await send(s.trainer.token, 'DELETE', `/events/${ev.id}/callups/${a.enrollmentId}`);
      expect(del.status).toBe(403);
      const mark = await send(s.player.token, 'PATCH', `/events/${ev.id}/callups/${a.enrollmentId}`, { placement: 'starter' });
      expect(mark.status).toBe(403);
    });

    it('a manager reads the lists in scope and writes only after a grant', async () => {
      const s = await club('cu-64@test.it');
      const ev = await s.event(s.t1.teamId);
      const p = await s.roster('p');
      await post(s.admin, '/invitations', { email: 'cu-64m@test.it', role: 'manager', scope: 'team', teamId: s.t1.teamId });
      const m = await accept('cu-64m@test.it');
      expect((await lists(m.token, ev.id)).view).toBe('read');
      expect((await callUp(m.token, ev.id, p.enrollmentId)).body.code).toBe('PERMISSION_DENIED');
      await t.req('PUT', `/permissions/${m.userId}`, { token: s.admin, body: { diff: { 'callups.manage': true } } });
      expect((await callUp(m.token, ev.id, p.enrollmentId)).status).toBe(201);
    });

    it('an event of another club is a 404 on every route', async () => {
      const s = await club('cu-65@test.it');
      const other = await club('cu-65b@test.it');
      const ev = await other.event(other.t1.teamId);
      const p = await s.roster('p');
      for (const [method, url, body] of [
        ['GET', `/events/${ev.id}/callups`, undefined],
        ['POST', `/events/${ev.id}/callups`, { enrollmentId: p.enrollmentId }],
        ['DELETE', `/events/${ev.id}/callups/${p.enrollmentId}`, undefined],
        ['PATCH', `/events/${ev.id}/callups/${p.enrollmentId}`, { placement: 'bench' }],
        ['POST', `/events/${ev.id}/callups/send`, undefined],
        ['PUT', `/events/${ev.id}/callups/me`, { response: 'confirmed' }],
        ['PUT', `/events/${ev.id}/availability/me`, { response: 'confirmed' }],
        ['GET', `/events/${ev.id}/callups/${p.enrollmentId}/history`, undefined],
      ] as const) {
        const r = await send(s.admin, method, url, body);
        expect([method, url.split('/').slice(3).join('/'), r.status, r.body.code]).toEqual([method, url.split('/').slice(3).join('/'), 404, 'EVENT_NOT_FOUND']);
      }
    });
  });

  const answer = (token: string, eventId: string, body: object) => send(token, 'PUT', `/events/${eventId}/callups/me`, body);
  const available = (token: string, eventId: string, body: object) => send(token, 'PUT', `/events/${eventId}/availability/me`, body);
  const history = async (token: string, eventId: string, enrollmentId: string) => {
    const r = await send(token, 'GET', `/events/${eventId}/callups/${enrollmentId}/history`);
    expect(r.status).toBe(200);
    return r.body.changes as { from: string; fromReason: string | null; to: string; reason: string | null; changedAt: string }[];
  };
  const trail = (c: { from: string; fromReason: string | null; to: string; reason: string | null }[]) => c.map((x) => `${x.from}${x.fromReason ? `(${x.fromReason})` : ''}>${x.to}${x.reason ? `(${x.reason})` : ''}`);

  describe('the player answers a call-up', () => {
    it('confirms in one tap and staff see the answer at once', async () => {
      const s = await club('cu-70@test.it');
      const ev = await s.event(s.t1.teamId);
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      const r = await answer(s.player.token, ev.id, { response: 'confirmed' });
      expect([r.status, r.body.response, r.body.reason, r.body.enrollmentId]).toEqual([200, 'confirmed', null, s.player.enrollmentId]);
      const row = (await lists(s.coach1.token, ev.id)).calledUp.find((x: { enrollmentId: string }) => x.enrollmentId === s.player.enrollmentId);
      expect(row.response).toBe('confirmed');
      expect((await lists(s.player.token, ev.id)).calledUp[0].response).toBe('confirmed');
    });

    it('declining needs a reason from the closed list, otherwise nothing is saved', async () => {
      const s = await club('cu-71@test.it');
      const ev = await s.event(s.t1.teamId);
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      const noReason = await answer(s.player.token, ev.id, { response: 'declined' });
      expect([noReason.status, noReason.body.code]).toEqual([400, 'REASON_REQUIRED']);
      for (const body of [{ response: 'declined', reason: 'holiday' }, { response: 'declined', reason: 'work', extra: 1 }, { response: 'pending' }, { response: 'confirmed', reason: 'work' }, {}]) {
        const r = await answer(s.player.token, ev.id, body);
        expect([JSON.stringify(body), r.status, r.body.code]).toEqual([JSON.stringify(body), 400, 'INVALID_DATA']);
      }
      const row = (await lists(s.coach1.token, ev.id)).calledUp[0];
      expect(row.response).toBe('pending');
      expect(await history(s.coach1.token, ev.id, s.player.enrollmentId)).toEqual([]);
      for (const reason of ['commitment_personal', 'work', 'not_available']) {
        expect((await answer(s.player.token, ev.id, { response: 'declined', reason })).status).toBe(200);
      }
    });

    it('every change of mind is kept with its date, a repeated answer is not a change', async () => {
      const s = await club('cu-72@test.it');
      const ev = await s.event(s.t1.teamId);
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      const before = Date.now();
      await answer(s.player.token, ev.id, { response: 'confirmed' });
      await answer(s.player.token, ev.id, { response: 'confirmed' });
      await answer(s.player.token, ev.id, { response: 'declined', reason: 'work' });
      await answer(s.player.token, ev.id, { response: 'declined', reason: 'work' });
      await answer(s.player.token, ev.id, { response: 'declined', reason: 'commitment_personal' });
      await answer(s.player.token, ev.id, { response: 'confirmed' });
      const changes = await history(s.coach1.token, ev.id, s.player.enrollmentId);
      expect(trail(changes)).toEqual([
        'pending>confirmed',
        'confirmed>declined(work)',
        'declined(work)>declined(commitment_personal)',
        'declined(commitment_personal)>confirmed',
      ]);
      const times = changes.map((c) => new Date(c.changedAt).getTime());
      expect(times.every((x) => x >= before && x <= Date.now())).toBe(true);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      // The staff row shows the latest answer and no reason once confirmed again.
      expect((await lists(s.coach1.token, ev.id)).calledUp[0].response).toBe('confirmed');
    });

    it('the history survives removing the call-up and calling the player up again', async () => {
      const s = await club('cu-73@test.it');
      const ev = await s.event(s.t1.teamId);
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      await answer(s.player.token, ev.id, { response: 'confirmed' });
      await send(s.coach1.token, 'DELETE', `/events/${ev.id}/callups/${s.player.enrollmentId}`);
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      expect((await lists(s.coach1.token, ev.id)).calledUp[0].response).toBe('pending');
      await answer(s.player.token, ev.id, { response: 'declined', reason: 'work' });
      expect(trail(await history(s.coach1.token, ev.id, s.player.enrollmentId))).toEqual(['pending>confirmed', 'pending>declined(work)']);
    });

    it('only the called-up player of that team, on an open event', async () => {
      const s = await club('cu-74@test.it');
      const ev = await s.event(s.t1.teamId);
      // Not called up.
      expect([(await answer(s.player.token, ev.id, { response: 'confirmed' })).status, (await answer(s.player.token, ev.id, { response: 'confirmed' })).body.code]).toEqual([404, 'CALLUP_NOT_FOUND']);
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      // Staff or a player of another team have no player enrollment in this season.
      for (const token of [s.coach1.token, s.coach2.token]) {
        const r = await answer(token, ev.id, { response: 'confirmed' });
        expect([r.status, r.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      }
      expect((await answer('', ev.id, { response: 'confirmed' })).status).toBe(401);
      // A cancelled event no longer takes answers.
      await t.req('POST', `/events/${ev.id}/cancel`, { token: s.admin });
      const r = await answer(s.player.token, ev.id, { response: 'confirmed' });
      expect([r.status, r.body.code]).toEqual([409, 'EVENT_NOT_EDITABLE']);
    });

    it('a closed season takes no answers', async () => {
      const s = await club('cu-75@test.it');
      const ev = await s.event(s.t1.teamId);
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      expect((await t.req('POST', `/seasons/${s.t1.seasonId}/close`, { token: s.admin })).status).toBe(200);
      const r = await answer(s.player.token, ev.id, { response: 'confirmed' });
      expect([r.status, r.body.code]).toEqual([409, 'SEASON_CLOSED']);
    });

    it('the history is for staff, managers and the admin, never for the player', async () => {
      const s = await club('cu-76@test.it');
      const ev = await s.event(s.t1.teamId);
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      await answer(s.player.token, ev.id, { response: 'declined', reason: 'work' });
      for (const token of [s.coach1.token, s.assistant.token, s.trainer.token, s.admin]) {
        expect(trail(await history(token, ev.id, s.player.enrollmentId))).toEqual(['pending>declined(work)']);
      }
      for (const token of [s.player.token, s.coach2.token]) {
        const r = await send(token, 'GET', `/events/${ev.id}/callups/${s.player.enrollmentId}/history`);
        expect([r.status, r.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      }
      // The player does not see anybody's reason in the lists either.
      expect(JSON.stringify(await lists(s.player.token, ev.id))).not.toContain('work');
    });

    it('a person who is player and staff in the same season answers each role on its own', async () => {
      const s = await club('cu-77@test.it');
      const ev = await s.event(s.t1.teamId);
      const both = await s.person('both');
      await s.certify(both.id);
      const asPlayer = await s.enroll(s.t1.seasonId, both.id, 'player');
      const asStaff = await s.enroll(s.t1.seasonId, both.id, 'staff', 'trainer');
      await post(s.admin, '/invitations', { email: `both-${s.email}`, role: 'player', personId: both.id });
      const me = await accept(`both-${s.email}`);
      await callUp(s.coach1.token, ev.id, asPlayer.id);
      expect((await answer(me.token, ev.id, { response: 'declined', reason: 'work' })).body.enrollmentId).toBe(asPlayer.id);
      expect((await available(me.token, ev.id, { response: 'confirmed' })).body.enrollmentId).toBe(asStaff.id);
      expect(trail(await history(s.coach1.token, ev.id, asPlayer.id))).toEqual(['pending>declined(work)']);
      expect(trail(await history(s.coach1.token, ev.id, asStaff.id))).toEqual(['pending>confirmed']);
    });
  });

  describe('staff availability', () => {
    const staffRows = (l: { staff: { enrollmentId: string; response: string | null }[] }) => Object.fromEntries(l.staff.map((x) => [x.enrollmentId, x.response]));

    it('a staff member declares in one tap, without any call-up, and changes mind with a trail', async () => {
      const s = await club('cu-80@test.it');
      const ev = await s.event(s.t1.teamId);
      expect(staffRows(await lists(s.coach1.token, ev.id))).toEqual({
        [s.coach1.enrollmentId]: null,
        [s.assistant.enrollmentId]: null,
        [s.trainer.enrollmentId]: null,
      });
      const r = await available(s.coach1.token, ev.id, { response: 'confirmed' });
      expect([r.status, r.body.response, r.body.enrollmentId]).toEqual([200, 'confirmed', s.coach1.enrollmentId]);
      await available(s.coach1.token, ev.id, { response: 'declined' });
      await available(s.coach1.token, ev.id, { response: 'declined' });
      await available(s.coach1.token, ev.id, { response: 'confirmed' });
      expect(trail(await history(s.admin, ev.id, s.coach1.enrollmentId))).toEqual(['pending>confirmed', 'confirmed>declined', 'declined>confirmed']);
      expect(staffRows(await lists(s.assistant.token, ev.id))[s.coach1.enrollmentId]).toBe('confirmed');
    });

    it('no reason, only confirmed or declined, only staff of that season, on an open event', async () => {
      const s = await club('cu-81@test.it');
      const ev = await s.event(s.t1.teamId);
      for (const body of [{ response: 'declined', reason: 'work' }, { response: 'pending' }, {}]) {
        const r = await available(s.coach1.token, ev.id, body);
        expect([JSON.stringify(body), r.status, r.body.code]).toEqual([JSON.stringify(body), 400, 'INVALID_DATA']);
      }
      for (const token of [s.player.token, s.coach2.token]) {
        const r = await available(token, ev.id, { response: 'confirmed' });
        expect([r.status, r.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      }
      await post(s.admin, '/invitations', { email: 'cu-81m@test.it', role: 'manager', scope: 'team', teamId: s.t1.teamId });
      const m = await accept('cu-81m@test.it');
      expect((await available(m.token, ev.id, { response: 'confirmed' })).status).toBe(403);
      await t.req('POST', `/events/${ev.id}/cancel`, { token: s.admin });
      const r = await available(s.coach1.token, ev.id, { response: 'confirmed' });
      expect([r.status, r.body.code]).toEqual([409, 'EVENT_NOT_EDITABLE']);
    });

    it('staff rows never leak into the player lists, the send or the call-up routes', async () => {
      const s = await club('cu-82@test.it');
      const ev = await s.event(s.t1.teamId);
      await callUp(s.coach1.token, ev.id, s.player.enrollmentId);
      await available(s.coach1.token, ev.id, { response: 'confirmed' });
      const l = await lists(s.coach1.token, ev.id);
      expect(ids([...l.calledUp, ...l.callable, ...l.notCallable])).not.toContain(s.coach1.enrollmentId);
      expect((await send(s.coach1.token, 'POST', `/events/${ev.id}/callups/send`)).body.notified.map((x: { enrollmentId: string }) => x.enrollmentId)).toEqual([s.player.enrollmentId]);
      const del = await send(s.coach1.token, 'DELETE', `/events/${ev.id}/callups/${s.coach1.enrollmentId}`);
      const mark = await send(s.coach1.token, 'PATCH', `/events/${ev.id}/callups/${s.coach1.enrollmentId}`, { placement: 'bench' });
      expect([del.status, del.body.code, mark.status, mark.body.code]).toEqual([404, 'CALLUP_NOT_FOUND', 404, 'CALLUP_NOT_FOUND']);
      expect(staffRows(await lists(s.coach1.token, ev.id))[s.coach1.enrollmentId]).toBe('confirmed');
    });

    it('everyone sees the available staff, only staff, managers and the admin see the rest', async () => {
      const s = await club('cu-83@test.it');
      const ev = await s.event(s.t1.teamId);
      await available(s.coach1.token, ev.id, { response: 'confirmed' });
      await available(s.assistant.token, ev.id, { response: 'declined' });
      const player = await lists(s.player.token, ev.id);
      expect(player.staff).toEqual([{ enrollmentId: s.coach1.enrollmentId, name: 'c1', surname: 'Rossi', staffRole: { id: expect.any(String), name: 'Allenatore' } }]);
      const text = JSON.stringify(player);
      for (const hidden of ['as-', 'tr-', s.assistant.enrollmentId, s.trainer.enrollmentId, 'declined']) expect(text).not.toContain(hidden);
      expect(Object.keys(player)).not.toContain('noCoachWarning');
      const coach = await lists(s.coach1.token, ev.id);
      expect(staffRows(coach)).toEqual({
        [s.coach1.enrollmentId]: 'confirmed',
        [s.assistant.enrollmentId]: 'declined',
        [s.trainer.enrollmentId]: null,
      });
      expect(coach.staff.find((x: { mine: boolean }) => x.mine).enrollmentId).toBe(s.coach1.enrollmentId);
      await post(s.admin, '/invitations', { email: 'cu-83m@test.it', role: 'manager', scope: 'team', teamId: s.t1.teamId });
      const m = await accept('cu-83m@test.it');
      expect(staffRows(await lists(m.token, ev.id))[s.assistant.enrollmentId]).toBe('declined');
    });

    it('warns staff when no coach is available, unless the club turned it off', async () => {
      const s = await club('cu-84@test.it');
      const ev = await s.event(s.t1.teamId);
      expect((await lists(s.coach1.token, ev.id)).noCoachWarning).toBe(true);
      // An assistant or a trainer does not replace a coach; a coach of another team does not count.
      await available(s.assistant.token, ev.id, { response: 'confirmed' });
      await available(s.trainer.token, ev.id, { response: 'confirmed' });
      expect((await lists(s.coach1.token, ev.id)).noCoachWarning).toBe(true);
      await available(s.coach1.token, ev.id, { response: 'confirmed' });
      expect((await lists(s.coach1.token, ev.id)).noCoachWarning).toBe(false);
      await available(s.coach1.token, ev.id, { response: 'declined' });
      expect((await lists(s.admin, ev.id)).noCoachWarning).toBe(true);
      expect((await t.req('PATCH', '/club/current/settings', { token: s.admin, body: { warnNoCoachAvailable: false } })).status).toBe(200);
      expect((await lists(s.coach1.token, ev.id)).noCoachWarning).toBe(false);
    });

    const mark = async (token: string, key: string, body: object) =>
      expect((await t.req('PATCH', `/staff-roles/${await roleId(t.req, token, key)}`, { token, body })).status).toBe(200);

    it('the club decides which staff roles must be available, for instance the assistant who steps in', async () => {
      const s = await club('cu-85@test.it');
      const ev = await s.event(s.t1.teamId);
      await available(s.assistant.token, ev.id, { response: 'confirmed' });
      expect((await lists(s.coach1.token, ev.id)).noCoachWarning).toBe(true);
      await mark(s.admin, 'assistant_coach', { mustBeAvailable: true });
      expect((await lists(s.coach1.token, ev.id)).noCoachWarning).toBe(false);
      // The trainer is not marked: his availability changes nothing.
      await available(s.assistant.token, ev.id, { response: 'declined' });
      await available(s.trainer.token, ev.id, { response: 'confirmed' });
      expect((await lists(s.coach1.token, ev.id)).noCoachWarning).toBe(true);
      await mark(s.admin, 'trainer', { mustBeAvailable: true });
      expect((await lists(s.coach1.token, ev.id)).noCoachWarning).toBe(false);
    });

    it('with no role marked as must be available there is nothing to warn about', async () => {
      const s = await club('cu-88@test.it');
      const ev = await s.event(s.t1.teamId);
      expect((await lists(s.coach1.token, ev.id)).noCoachWarning).toBe(true);
      await mark(s.admin, 'coach', { mustBeAvailable: false });
      expect((await lists(s.coach1.token, ev.id)).noCoachWarning).toBe(false);
      expect((await lists(s.admin, ev.id)).noCoachWarning).toBe(false);
    });

    it('an archived role that must be available still counts for who already has it', async () => {
      const s = await club('cu-89@test.it');
      const ev = await s.event(s.t1.teamId);
      await mark(s.admin, 'coach', { archived: true });
      expect((await lists(s.coach1.token, ev.id)).noCoachWarning).toBe(true);
      await available(s.coach1.token, ev.id, { response: 'confirmed' });
      expect((await lists(s.coach1.token, ev.id)).noCoachWarning).toBe(false);
    });
  });
});
