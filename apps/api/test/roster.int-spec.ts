import { AuditLog } from '../src/entities/audit-log.entity';
import { Enrollment } from '../src/entities/enrollment.entity';
import { Person } from '../src/entities/person.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Season } from '../src/entities/season.entity';
import { Environment, startEnvironment } from './helpers';

describe('people, roster and disabling', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
    const em = t.orm.em.fork();
    em.create(SportProfile, { code: 'generic', positions: [], modulesAvailable: ['attendances'] } as never);
    em.create(SportProfile, { code: 'football', positions: ['goalkeeper', 'defender', 'midfielder', 'forward'], modulesAvailable: ['attendances'] } as never);
    await em.flush();
  });
  afterAll(async () => {
    await t?.close();
  });

  async function admin(email: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    return { token: c.body.accessToken as string, clubId: c.body.activeClub.id as string, userId: s.user.id as string };
  }

  /** Club with an activity, a team and a season (draft). */
  async function context(email: string) {
    const a = await admin(email);
    const act = (await t.req('POST', '/activities', { token: a.token, body: { name: 'Football', sportProfile: 'football' } })).body;
    const sq = (await t.req('POST', `/activities/${act.id}/teams`, { token: a.token, body: { name: 'Under 15' } })).body;
    const st = (await t.req('POST', `/teams/${sq.id}/seasons`, { token: a.token, body: { name: '2026/27', startDate: '2026-09-01', endDate: '2027-06-30' } })).body;
    return { ...a, seasonId: st.id as string, teamId: sq.id as string };
  }

  const person = (token: string, extra: object = {}) =>
    t.req('POST', '/people', { token, body: { name: 'Luca', surname: 'Verdi', birthDate: '2010-03-04', email: 'luca@test.it', ...extra } });
  const enroll = (token: string, seasonId: string, personId: string, extra: object = { type: 'player' }) =>
    t.req('POST', `/seasons/${seasonId}/enrollments`, { token, body: { personId, ...extra } });
  const roster = (token: string, seasonId: string) => t.req('GET', `/seasons/${seasonId}/roster`, { token });
  const audit = (action: string, entityId: string) =>
    t.orm.em.fork().find(AuditLog, { action: action as never, entityId }, { filters: false });

  describe('registry', () => {
    it('creates a complete record', async () => {
      const a = await admin('an-1@test.it');
      const r = await person(a.token);
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ name: 'Luca', surname: 'Verdi', birthDate: '2010-03-04', toComplete: false });
    });

    it('with only name and contact the record is incomplete', async () => {
      const a = await admin('an-2@test.it');
      const r = await t.req('POST', '/people', { token: a.token, body: { name: 'Anna', phone: '+393331234567' } });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ name: 'Anna', surname: null, toComplete: true });
    });

    it('at least one contact is required', async () => {
      const a = await admin('an-3@test.it');
      const r = await t.req('POST', '/people', { token: a.token, body: { name: 'Anna' } });
      expect([r.status, r.body.code]).toEqual([400, 'CONTACT_REQUIRED']);
    });

    it('nonexistent or future birth date', async () => {
      const a = await admin('an-4@test.it');
      for (const birthDate of ['2010-02-30', '2999-01-01']) {
        const r = await person(a.token, { birthDate });
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_BIRTH_DATE']);
      }
    });

    it('search by name, surname and email, case-insensitive', async () => {
      const a = await admin('an-5@test.it');
      await person(a.token, { name: 'Marco', surname: 'Bianchi', email: 'marco@test.it' });
      await person(a.token, { name: 'Sara', surname: 'Neri', email: 'sara@test.it' });
      const search = async (q: string) => (await t.req('GET', `/people?q=${encodeURIComponent(q)}`, { token: a.token })).body.map((p: any) => p.name);
      expect(await search('BIANC')).toEqual(['Marco']);
      expect(await search('sara@')).toEqual(['Sara']);
      expect(await search('ar')).toEqual(['Marco', 'Sara']);
      expect((await t.req('GET', '/people', { token: a.token })).body).toHaveLength(2);
    });

    it('isolation: another club neither sees nor touches the records', async () => {
      const a = await admin('an-6a@test.it');
      const b = await admin('an-6b@test.it');
      const p = (await person(a.token)).body;
      expect((await t.req('GET', '/people', { token: b.token })).body).toEqual([]);
      const r = await t.req('GET', `/people/${p.id}`, { token: b.token });
      expect([r.status, r.body.code]).toEqual([404, 'PERSON_NOT_FOUND']);
    });

    it('the record shows enrollments by season', async () => {
      const c = await context('an-7@test.it');
      const p = (await person(c.token)).body;
      await enroll(c.token, c.seasonId, p.id, { type: 'player', position: 'goalkeeper', jerseyNumber: 1 });
      const r = await t.req('GET', `/people/${p.id}`, { token: c.token });
      expect(r.status).toBe(200);
      expect(r.body.enrollments).toEqual([
        expect.objectContaining({ seasonId: c.seasonId, season: '2026/27', team: 'Under 15', activity: 'Football', type: 'player', position: 'goalkeeper', jerseyNumber: 1, endedAt: null }),
      ]);
    });
  });

  describe('roster', () => {
    it('adds players and staff and lists them', async () => {
      const c = await context('ro-1@test.it');
      const g = (await person(c.token)).body;
      const s = (await person(c.token, { name: 'Pietro', surname: 'Gialli', email: 'pietro@test.it' })).body;
      const i1 = await enroll(c.token, c.seasonId, g.id, { type: 'player', position: 'forward', jerseyNumber: 9 });
      const i2 = await enroll(c.token, c.seasonId, s.id, { type: 'staff', staffRole: 'coach' });
      expect([i1.status, i2.status]).toEqual([201, 201]);
      const r = await roster(c.token, c.seasonId);
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(2);
      expect(r.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ personId: g.id, name: 'Luca', surname: 'Verdi', type: 'player', position: 'forward', jerseyNumber: 9, status: 'available' }),
          expect.objectContaining({ personId: s.id, name: 'Pietro', type: 'staff', staffRole: 'coach' }),
        ]),
      );
    });

    it.each([
      [{ type: 'staff' }, 'STAFF_ROLE_REQUIRED'],
      [{ type: 'player', staffRole: 'coach' }, 'STAFF_ROLE_NOT_ALLOWED'],
      [{ type: 'staff', staffRole: 'other', jerseyNumber: 3 }, 'PLAYER_DATA_NOT_ALLOWED'],
      [{ type: 'player', jerseyNumber: 1000 }, 'INVALID_NUMBER_JERSEY'],
    ])('dati incoerenti %j: %s', async (extra, code) => {
      const c = await context(`ro-2-${code.toLowerCase()}@test.it`);
      const p = (await person(c.token)).body;
      const r = await enroll(c.token, c.seasonId, p.id, extra);
      expect([r.status, r.body.code]).toEqual([400, code]);
    });

    it('the same person cannot enroll twice with the same type', async () => {
      const c = await context('ro-3@test.it');
      const p = (await person(c.token)).body;
      expect((await enroll(c.token, c.seasonId, p.id)).status).toBe(201);
      const r = await enroll(c.token, c.seasonId, p.id);
      expect([r.status, r.body.code]).toEqual([409, 'ENROLLMENT_EXISTS']);
      // As staff in the same season yes: player and coach together are allowed.
      expect((await enroll(c.token, c.seasonId, p.id, { type: 'staff', staffRole: 'other' })).status).toBe(201);
    });

    it('a closed season accepts neither enrollments nor edits (rule 7)', async () => {
      const c = await context('ro-4@test.it');
      const p = (await person(c.token)).body;
      const i = (await enroll(c.token, c.seasonId, p.id)).body;
      await t.orm.em.fork().nativeUpdate(Season, { id: c.seasonId }, { status: 'closed' } as never, { filters: false });
      const fresh = await enroll(c.token, c.seasonId, p.id, { type: 'staff', staffRole: 'other' });
      expect([fresh.status, fresh.body.code]).toEqual([409, 'SEASON_CLOSED']);
      const mod = await t.req('PATCH', `/enrollments/${i.id}`, { token: c.token, body: { jerseyNumber: 5 } });
      expect([mod.status, mod.body.code]).toEqual([409, 'SEASON_CLOSED']);
      const close = await t.req('POST', `/enrollments/${i.id}/close`, { token: c.token });
      expect([close.status, close.body.code]).toEqual([409, 'SEASON_CLOSED']);
    });

    it('person or season of another club: 404', async () => {
      const c = await context('ro-5a@test.it');
      const other = await admin('ro-5b@test.it');
      const p = (await person(c.token)).body;
      const r1 = await enroll(other.token, c.seasonId, p.id);
      expect([r1.status, r1.body.code]).toEqual([404, 'SEASON_NOT_FOUND']);
      const my = await context('ro-5c@test.it');
      const r2 = await enroll(my.token, my.seasonId, p.id);
      expect([r2.status, r2.body.code]).toEqual([404, 'PERSON_NOT_FOUND']);
      expect((await roster(other.token, c.seasonId)).status).toBe(404);
    });

    it('edits jersey, position and status', async () => {
      const c = await context('ro-6@test.it');
      const p = (await person(c.token)).body;
      const i = (await enroll(c.token, c.seasonId, p.id)).body;
      const r = await t.req('PATCH', `/enrollments/${i.id}`, { token: c.token, body: { jerseyNumber: 10, position: 'defender', status: 'injured' } });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ jerseyNumber: 10, position: 'defender', status: 'injured' });
      const inconsistent = await t.req('PATCH', `/enrollments/${i.id}`, { token: c.token, body: { staffRole: 'other' } });
      expect([inconsistent.status, inconsistent.body.code]).toEqual([400, 'STAFF_ROLE_NOT_ALLOWED']);
    });

    describe('position and sport profile', () => {
      it('when enrolling, rejects a position the profile does not provide', async () => {
        const c = await context('po-1@test.it');
        const p = (await person(c.token)).body;
        for (const position of ['Goalkeeper', 'pivot']) {
          const r = await enroll(c.token, c.seasonId, p.id, { type: 'player', position });
          expect([r.status, r.body.code]).toEqual([400, 'INVALID_POSITION']);
        }
        expect((await roster(c.token, c.seasonId)).body).toEqual([]);
      });

      it('when editing, rejects a position not provided and leaves the enrollment unchanged', async () => {
        const c = await context('po-2@test.it');
        const p = (await person(c.token)).body;
        const i = (await enroll(c.token, c.seasonId, p.id, { type: 'player', position: 'goalkeeper' })).body;
        const r = await t.req('PATCH', `/enrollments/${i.id}`, { token: c.token, body: { position: 'pivot' } });
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_POSITION']);
        expect((await roster(c.token, c.seasonId)).body[0]).toMatchObject({ position: 'goalkeeper' });
      });

      it('a profile without positions rejects all of them, a missing position stays valid', async () => {
        const a = await admin('po-3@test.it');
        const act = (await t.req('POST', '/activities', { token: a.token, body: { name: 'Fencing', sportProfile: 'generic' } })).body;
        const sq = (await t.req('POST', `/activities/${act.id}/teams`, { token: a.token, body: { name: 'Group' } })).body;
        const st = (await t.req('POST', `/teams/${sq.id}/seasons`, { token: a.token, body: { name: '2026/27', startDate: '2026-09-01', endDate: '2027-06-30' } })).body;
        const p = (await person(a.token)).body;
        const r = await enroll(a.token, st.id, p.id, { type: 'player', position: 'goalkeeper' });
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_POSITION']);
        expect((await enroll(a.token, st.id, p.id, { type: 'player' })).status).toBe(201);
      });
    });

    it('closing an enrollment removes it from the roster and audits it', async () => {
      const c = await context('ro-7@test.it');
      const p = (await person(c.token)).body;
      const i = (await enroll(c.token, c.seasonId, p.id)).body;
      const r = await t.req('POST', `/enrollments/${i.id}/close`, { token: c.token });
      expect(r.status).toBe(200);
      expect(r.body.endedAt).toBe(new Date().toISOString().slice(0, 10));
      expect((await roster(c.token, c.seasonId)).body).toEqual([]);
      expect(await audit('closed_enrollment', i.id)).toHaveLength(1);
      // Already closed: neither edits nor a second closure.
      const still = await t.req('POST', `/enrollments/${i.id}/close`, { token: c.token });
      expect([still.status, still.body.code]).toEqual([409, 'ENROLLMENT_CLOSED']);
      const mod = await t.req('PATCH', `/enrollments/${i.id}`, { token: c.token, body: { jerseyNumber: 2 } });
      expect([mod.status, mod.body.code]).toEqual([409, 'ENROLLMENT_CLOSED']);
    });
  });

  describe('injured state shared across the teams of a person (#27)', () => {
    /** Second team with its own draft season in the same club. */
    async function secondSeason(token: string, name = 'Under 17') {
      const act = (await t.req('POST', '/activities', { token, body: { name: `Football ${name}`, sportProfile: 'football' } })).body;
      const sq = (await t.req('POST', `/activities/${act.id}/teams`, { token, body: { name } })).body;
      const st = (await t.req('POST', `/teams/${sq.id}/seasons`, { token, body: { name: '2026/27', startDate: '2026-09-01', endDate: '2027-06-30' } })).body;
      return st.id as string;
    }
    const setStatus = (token: string, id: string, status: string) => t.req('PATCH', `/enrollments/${id}`, { token, body: { status } });
    const statusOf = async (id: string) => (await t.orm.em.fork().findOneOrFail(Enrollment, id, { filters: false })).status;

    it('marking injured in one team marks every open player enrollment, and clearing clears them all', async () => {
      const c = await context('sh-1@test.it');
      const second = await secondSeason(c.token);
      const p = (await person(c.token)).body;
      const a = (await enroll(c.token, c.seasonId, p.id)).body;
      const b = (await enroll(c.token, second, p.id)).body;
      expect((await setStatus(c.token, a.id, 'injured')).status).toBe(200);
      expect(await statusOf(b.id)).toBe('injured');
      expect((await roster(c.token, second)).body[0].status).toBe('injured');
      expect((await setStatus(c.token, b.id, 'available')).status).toBe(200);
      expect(await statusOf(a.id)).toBe('available');
    });

    it('a new enrollment of an injured person starts injured, in a new team and in a promotion', async () => {
      const c = await context('sh-2@test.it');
      const second = await secondSeason(c.token);
      const third = await secondSeason(c.token, 'Under 19');
      const p = (await person(c.token)).body;
      const a = (await enroll(c.token, c.seasonId, p.id)).body;
      await setStatus(c.token, a.id, 'injured');
      const b = await enroll(c.token, second, p.id);
      expect(b.body.status).toBe('injured');
      const promoted = await t.req('POST', `/enrollments/${a.id}/promote`, { token: c.token, body: { seasonId: third } });
      expect(promoted.status).toBe(201);
      expect(promoted.body.status).toBe('injured');
    });

    it('leaves alone closed enrollments, closed seasons and staff enrollments', async () => {
      const c = await context('sh-3@test.it');
      const closedEnrollmentSeason = await secondSeason(c.token, 'Under 13');
      const closedSeason = await secondSeason(c.token, 'Under 11');
      const staffSeason = await secondSeason(c.token, 'Under 9');
      const p = (await person(c.token)).body;
      const a = (await enroll(c.token, c.seasonId, p.id)).body;
      const ended = (await enroll(c.token, closedEnrollmentSeason, p.id)).body;
      await t.req('POST', `/enrollments/${ended.id}/close`, { token: c.token });
      const inClosed = (await enroll(c.token, closedSeason, p.id)).body;
      await t.orm.em.fork().nativeUpdate(Season, { id: closedSeason }, { status: 'closed' } as never, { filters: false });
      const staff = (await enroll(c.token, staffSeason, p.id, { type: 'staff', staffRole: 'other' })).body;
      expect((await setStatus(c.token, a.id, 'injured')).status).toBe(200);
      expect(await statusOf(ended.id)).toBe('available');
      expect(await statusOf(inClosed.id)).toBe('available');
      expect(await statusOf(staff.id)).toBe('available');
    });

    it('does not touch the enrollments of other people', async () => {
      const c = await context('sh-4@test.it');
      const second = await secondSeason(c.token);
      const p = (await person(c.token)).body;
      const q = (await person(c.token, { name: 'Marco', email: 'marco@test.it' })).body;
      const a = (await enroll(c.token, c.seasonId, p.id)).body;
      const other = (await enroll(c.token, second, q.id)).body;
      await setStatus(c.token, a.id, 'injured');
      expect(await statusOf(other.id)).toBe('available');
    });

    it('audits one entry per touched enrollment, naming where it started, with the status only', async () => {
      const c = await context('sh-5@test.it');
      const second = await secondSeason(c.token);
      const p = (await person(c.token)).body;
      const a = (await enroll(c.token, c.seasonId, p.id)).body;
      const b = (await enroll(c.token, second, p.id)).body;
      await setStatus(c.token, a.id, 'injured');
      const first = await audit('enrollment_status_modified', a.id);
      const propagated = await audit('enrollment_status_modified', b.id);
      expect([first, propagated].map((e) => e.length)).toEqual([1, 1]);
      expect(propagated[0].meta).toEqual({ from: 'available', a: 'injured', origin: a.id });
      expect(first[0].meta).toEqual({ from: 'available', a: 'injured', origin: a.id });
    });

    it('an unchanged status writes no audit and touches nothing', async () => {
      const c = await context('sh-6@test.it');
      const second = await secondSeason(c.token);
      const p = (await person(c.token)).body;
      const a = (await enroll(c.token, c.seasonId, p.id)).body;
      const b = (await enroll(c.token, second, p.id)).body;
      await setStatus(c.token, a.id, 'available');
      expect(await audit('enrollment_status_modified', b.id)).toHaveLength(0);
    });
  });

  describe('disabling (rule 12)', () => {
    it('the person disappears from lists and roster, stays in the archive, and can be re-enabled', async () => {
      const c = await context('of-1@test.it');
      const p = (await person(c.token)).body;
      await enroll(c.token, c.seasonId, p.id);

      const d = await t.req('POST', `/people/${p.id}/disable`, { token: c.token });
      expect(d.status).toBe(200);
      expect(d.body.disabled).toBe(true);
      expect((await t.req('GET', '/people', { token: c.token })).body).toEqual([]);
      expect((await roster(c.token, c.seasonId)).body).toEqual([]);
      expect((await t.req('GET', '/people/disabled', { token: c.token })).body).toEqual([expect.objectContaining({ id: p.id })]);
      expect(await audit('person_disabled', p.id)).toHaveLength(1);

      const dTwice = await t.req('POST', `/people/${p.id}/disable`, { token: c.token });
      expect([dTwice.status, dTwice.body.code]).toEqual([409, 'PERSON_ALREADY_DISABLED']);

      const r = await t.req('POST', `/people/${p.id}/reenable`, { token: c.token });
      expect([r.status, r.body.disabled]).toEqual([200, false]);
      expect(await audit('person_reenabled', p.id)).toHaveLength(1);
      expect((await t.req('GET', '/people', { token: c.token })).body).toHaveLength(1);
      expect((await roster(c.token, c.seasonId)).body).toHaveLength(1);
      const rTwice = await t.req('POST', `/people/${p.id}/reenable`, { token: c.token });
      expect([rTwice.status, rTwice.body.code]).toEqual([409, 'PERSON_NOT_DISABLED']);
    });

    it('a disabled person cannot be enrolled or invited', async () => {
      const c = await context('of-2@test.it');
      const p = (await person(c.token)).body;
      await t.req('POST', `/people/${p.id}/disable`, { token: c.token });
      const i = await enroll(c.token, c.seasonId, p.id);
      expect([i.status, i.body.code]).toEqual([409, 'PERSON_DISABLED']);
      const inv = await t.req('POST', '/invitations', { token: c.token, body: { email: 'luca@test.it', role: 'player', personId: p.id } });
      expect([inv.status, inv.body.code]).toEqual([409, 'PERSON_DISABLED']);
    });

    it('their access is blocked immediately, with the same token', async () => {
      const c = await context('of-3@test.it');
      await t.req('POST', '/invitations', { token: c.token, body: { email: 'athlete@test.it', role: 'player', name: 'Athlete' } });
      const invitations = (await t.req('GET', '/invitations', { token: c.token })).body;
      const sess = await t.newUser('athlete@test.it');
      const acc = await t.req('POST', '/invitations/accept', { token: sess.accessToken, body: { token: t.tokenInvitation('athlete@test.it') } });
      expect(acc.status).toBe(200);
      const tk = acc.body.accessToken as string;
      expect((await t.req('GET', '/people/me', { token: tk })).status).toBe(200);

      const personId = invitations[0].personId as string;
      expect((await t.req('POST', `/people/${personId}/disable`, { token: c.token })).status).toBe(200);
      const r = await t.req('GET', '/people/me', { token: tk });
      expect([r.status, r.body.code]).toEqual([403, 'CLUB_NOT_ACCESSIBLE']);

      await t.req('POST', `/people/${personId}/reenable`, { token: c.token });
      expect((await t.req('GET', '/people/me', { token: tk })).status).toBe(200);
    });

    it('the last admin cannot be disabled', async () => {
      const c = await context('of-4@test.it');
      const em = t.orm.em.fork();
      const my = em.create(Person, { club: c.clubId, name: 'Io', surname: 'Admin', birthDate: '1980-01-01', completedAt: new Date(), email: 'of-4@test.it', user: c.userId } as never);
      await em.flush();
      const r = await t.req('POST', `/people/${my.id}/disable`, { token: c.token });
      expect([r.status, r.body.code]).toEqual([409, 'LAST_ADMIN']);
      expect((await t.orm.em.fork().findOneOrFail(Person, my.id, { filters: false })).disabledAt).toBeNull();
    });

    it('with another admin an admin can be disabled', async () => {
      const c = await context('of-5@test.it');
      const em = t.orm.em.fork();
      const my = em.create(Person, { club: c.clubId, name: 'Io', surname: 'Admin', birthDate: '1980-01-01', completedAt: new Date(), email: 'of-5@test.it', user: c.userId } as never);
      await em.flush();
      await t.req('POST', '/invitations', { token: c.token, body: { email: 'of-5b@test.it', role: 'admin' } });
      const s2 = await t.newUser('of-5b@test.it');
      expect((await t.req('POST', '/invitations/accept', { token: s2.accessToken, body: { token: t.tokenInvitation('of-5b@test.it') } })).status).toBe(200);
      expect((await t.req('POST', `/people/${my.id}/disable`, { token: c.token })).status).toBe(200);
    });

    it('another club cannot disable', async () => {
      const a = await admin('of-6a@test.it');
      const b = await admin('of-6b@test.it');
      const p = (await person(a.token)).body;
      const r = await t.req('POST', `/people/${p.id}/disable`, { token: b.token });
      expect([r.status, r.body.code]).toEqual([404, 'PERSON_NOT_FOUND']);
    });
  });

  describe('permissions', () => {
    it('a non-admin gets 403 on registry, roster and disabling', async () => {
      const c = await context('pe-1@test.it');
      const p = (await person(c.token)).body;
      const i = (await enroll(c.token, c.seasonId, p.id)).body;
      await t.req('POST', '/invitations', { token: c.token, body: { email: 'pe-dir@test.it', role: 'manager' } });
      const dir = await t.newUser('pe-dir@test.it');
      const acc = await t.req('POST', '/invitations/accept', { token: dir.accessToken, body: { token: t.tokenInvitation('pe-dir@test.it') } });
      const tk = acc.body.accessToken as string;

      const calls: [string, string, object?][] = [
        ['POST', '/people', { name: 'X', email: 'x@test.it' }],
        ['GET', '/people'],
        ['GET', '/people/disabled'],
        ['GET', `/people/${p.id}`],
        ['POST', `/people/${p.id}/disable`],
        ['POST', `/people/${p.id}/reenable`],
        ['GET', `/seasons/${c.seasonId}/roster`],
        ['POST', `/seasons/${c.seasonId}/enrollments`, { personId: p.id, type: 'player' }],
        ['PATCH', `/enrollments/${i.id}`, { jerseyNumber: 2 }],
        ['POST', `/enrollments/${i.id}/close`],
      ];
      for (const [m, u, body] of calls) {
        const r = await t.req(m, u, { token: tk, ...(body ? { body } : {}) });
        expect([m, u, r.status, r.body.code]).toEqual([m, u, 403, 'ADMIN_ONLY']);
      }
    });
  });
});
