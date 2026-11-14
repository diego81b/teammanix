import { AuditLog } from '../src/entities/audit-log.entity';
import { Enrollment } from '../src/entities/enrollment.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Season } from '../src/entities/season.entity';
import { Environment, startEnvironment, createTeams, roleId } from './helpers';

describe('closure, cloning and promotion (rules 7, 8, 9)', () => {
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
    return { token: c.body.accessToken as string, clubId: c.body.activeClub.id as string };
  }

  /** Club without sections, two teams and an active season for the first (2026/27). */
  async function context(email: string) {
    const a = await admin(email);
    const struct = await createTeams(t.req, a.token, { sportProfile: 'football' });
    const sq1 = await struct.team('Under 15');
    const sq2 = await struct.team('Under 17');
    const st = (await createSeason(a.token, sq1.id)).body;
    expect((await t.req('POST', `/seasons/${st.id}/active`, { token: a.token })).status).toBe(200);
    return { ...a, team1: sq1.id as string, team2: sq2.id as string, seasonId: st.id as string };
  }

  const createSeason = (token: string, teamId: string, extra: object = {}) =>
    t.req('POST', `/teams/${teamId}/seasons`, { token, body: { name: '2026/27', startDate: '2026-09-01', endDate: '2027-06-30', ...extra } });
  const person = async (token: string, name: string) =>
    (await t.req('POST', '/people', { token, body: { name, surname: 'Rossi', birthDate: '2010-03-04', email: `${name.toLowerCase()}-${Math.random().toString(36).slice(2)}@test.it` } })).body;
  /** Fixtures name a default role (`staffRole: 'coach'`); the API takes the id of the club's role. */
  const withRole = async (token: string, body: Record<string, unknown>) => {
    const { staffRole, ...rest } = body;
    return typeof staffRole === 'string' ? { ...rest, staffRoleId: await roleId(t.req, token, staffRole) } : body;
  };
  const enroll = async (token: string, seasonId: string, personId: string, extra: Record<string, unknown> = { type: 'player' }) => {
    const r = await t.req('POST', `/seasons/${seasonId}/enrollments`, { token, body: { personId, ...(await withRole(token, extra)) } });
    expect(r.status).toBe(201);
    return r.body;
  };
  const roster = (token: string, seasonId: string) => t.req('GET', `/seasons/${seasonId}/roster`, { token });
  const closeSeason = (token: string, id: string) => t.req('POST', `/seasons/${id}/close`, { token });
  const newSeason = { name: '2027/28', startDate: '2027-09-01', endDate: '2028-06-30' };
  const clone = (token: string, id: string, enrollments: string[], extra: object = {}) =>
    t.req('POST', `/seasons/${id}/clone`, { token, body: { ...newSeason, enrollments, ...extra } });
  const promote = async (token: string, id: string, body: Record<string, unknown>) => t.req('POST', `/enrollments/${id}/promote`, { token, body: await withRole(token, body) });
  const audit = (action: string, entityId: string) => t.orm.em.fork().find(AuditLog, { action: action as never, entityId }, { filters: false });
  const seasonsOf = (teamId: string) => t.orm.em.fork().find(Season, { team: teamId }, { filters: false });

  describe('closure', () => {
    it('closes an active season, the roster stays readable and everything becomes read-only', async () => {
      const c = await context('ch-1@test.it');
      const p = await person(c.token, 'Luca');
      const i = await enroll(c.token, c.seasonId, p.id, { type: 'player', jerseyNumber: 7 });
      const r = await closeSeason(c.token, c.seasonId);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ id: c.seasonId, status: 'closed' });
      expect(await audit('closed_season', c.seasonId)).toHaveLength(1);
      // Enrollments stay open: the historical roster is the one at the end of the season.
      expect((await roster(c.token, c.seasonId)).body).toEqual([expect.objectContaining({ id: i.id, jerseyNumber: 7 })]);
      const mod = await t.req('PATCH', `/enrollments/${i.id}`, { token: c.token, body: { jerseyNumber: 8 } });
      expect([mod.status, mod.body.code]).toEqual([409, 'SEASON_CLOSED']);
      const act = await t.req('POST', `/seasons/${c.seasonId}/active`, { token: c.token });
      expect([act.status, act.body.code]).toEqual([409, 'SEASON_NOT_ACTIVATABLE']);
    });

    it('after closure the team can activate another season', async () => {
      const c = await context('ch-2@test.it');
      const draft = (await createSeason(c.token, c.team1, { name: '2027/28' })).body;
      expect((await t.req('POST', `/seasons/${draft.id}/active`, { token: c.token })).body.code).toBe('ACTIVE_SEASON_EXISTS');
      await closeSeason(c.token, c.seasonId);
      expect((await t.req('POST', `/seasons/${draft.id}/active`, { token: c.token })).status).toBe(200);
    });

    it('a draft or an already closed season cannot be closed', async () => {
      const c = await context('ch-3@test.it');
      const draft = (await createSeason(c.token, c.team2)).body;
      const r1 = await closeSeason(c.token, draft.id);
      expect([r1.status, r1.body.code]).toEqual([409, 'SEASON_NOT_CLOSABLE']);
      await closeSeason(c.token, c.seasonId);
      const r2 = await closeSeason(c.token, c.seasonId);
      expect([r2.status, r2.body.code]).toEqual([409, 'SEASON_NOT_CLOSABLE']);
      expect(await audit('closed_season', c.seasonId)).toHaveLength(1);
    });

    it('a season of another club: 404', async () => {
      const c = await context('ch-4a@test.it');
      const other = await admin('ch-4b@test.it');
      const r = await closeSeason(other.token, c.seasonId);
      expect([r.status, r.body.code]).toEqual([404, 'SEASON_NOT_FOUND']);
    });
  });

  describe('guided cloning (rule 8)', () => {
    it('creates a draft in the same team with only the chosen enrollments, without touching the source', async () => {
      const c = await context('cl-1@test.it');
      const [a, b, s] = [await person(c.token, 'Anna'), await person(c.token, 'Bruno'), await person(c.token, 'Sergio')];
      const ia = await enroll(c.token, c.seasonId, a.id, { type: 'player', position: 'goalkeeper', jerseyNumber: 1 });
      await enroll(c.token, c.seasonId, b.id, { type: 'player', jerseyNumber: 9 });
      const is = await enroll(c.token, c.seasonId, s.id, { type: 'staff', staffRole: 'coach' });
      await t.req('PATCH', `/enrollments/${ia.id}`, { token: c.token, body: { status: 'injured' } });
      await closeSeason(c.token, c.seasonId);

      const r = await clone(c.token, c.seasonId, [ia.id, is.id], { league: 'Under 15 Regionale' });
      expect(r.status).toBe(201);
      expect(r.body.season).toMatchObject({ teamId: c.team1, name: '2027/28', startDate: '2027-09-01', endDate: '2028-06-30', status: 'draft', league: 'Under 15 Regionale' });
      expect(r.body.enrollments).toBe(2);

      const fresh = (await roster(c.token, r.body.season.id)).body;
      expect(fresh).toHaveLength(2);
      expect(fresh).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ personId: a.id, type: 'player', position: 'goalkeeper', jerseyNumber: 1, status: 'available' }),
          expect.objectContaining({ personId: s.id, type: 'staff', staffRole: { id: expect.any(String), name: 'Allenatore' } }),
        ]),
      );
      // Source unchanged: full roster, injured status of the first enrollment, no closed enrollment.
      const old = (await roster(c.token, c.seasonId)).body;
      expect(old).toHaveLength(3);
      expect(old.find((x: any) => x.id === ia.id).status).toBe('injured');
      expect(await t.orm.em.fork().count(Enrollment, { season: c.seasonId, endedAt: { $ne: null } }, { filters: false })).toBe(0);
    });

    it('also works from an active season, and a person who is player and staff is cloned twice', async () => {
      const c = await context('cl-2@test.it');
      const p = await person(c.token, 'Piero');
      const ig = await enroll(c.token, c.seasonId, p.id, { type: 'player' });
      const is = await enroll(c.token, c.seasonId, p.id, { type: 'staff', staffRole: 'assistant_coach' });
      const r = await clone(c.token, c.seasonId, [ig.id, is.id]);
      expect(r.status).toBe(201);
      expect((await roster(c.token, r.body.season.id)).body).toHaveLength(2);
    });

    it('without chosen enrollments creates an empty draft', async () => {
      const c = await context('cl-3@test.it');
      const r = await clone(c.token, c.seasonId, []);
      expect([r.status, r.body.enrollments]).toEqual([201, 0]);
      expect((await roster(c.token, r.body.season.id)).body).toEqual([]);
    });

    it('invalid period: 400 and no season created', async () => {
      const c = await context('cl-4@test.it');
      const r = await clone(c.token, c.seasonId, [], { startDate: '2028-09-01', endDate: '2028-06-30' });
      expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATE_SEASON']);
      expect(await seasonsOf(c.team1)).toHaveLength(1);
    });

    it('enrollments of another season, already closed or nonexistent are rejected', async () => {
      const c = await context('cl-5@test.it');
      const p = await person(c.token, 'Paolo');
      const ok = await enroll(c.token, c.seasonId, p.id);
      const otherSeason = (await createSeason(c.token, c.team2)).body;
      const outside = await enroll(c.token, otherSeason.id, p.id);
      const closed = await enroll(c.token, c.seasonId, (await person(c.token, 'Chiara')).id);
      await t.req('POST', `/enrollments/${closed.id}/close`, { token: c.token });
      for (const id of [outside.id, closed.id, '00000000-0000-4000-8000-000000000000']) {
        const r = await clone(c.token, c.seasonId, [ok.id, id]);
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_ENROLLMENTS']);
      }
      expect(await seasonsOf(c.team1)).toHaveLength(1);
    });

    it('a disabled person is rejected and nothing is created (rule 12)', async () => {
      const c = await context('cl-6@test.it');
      const [a, b] = [await person(c.token, 'Anna'), await person(c.token, 'Bruno')];
      const ia = await enroll(c.token, c.seasonId, a.id);
      const ib = await enroll(c.token, c.seasonId, b.id);
      await t.req('POST', `/people/${b.id}/disable`, { token: c.token });
      const r = await clone(c.token, c.seasonId, [ia.id, ib.id]);
      expect([r.status, r.body.code]).toEqual([409, 'PERSON_DISABLED']);
      expect(await seasonsOf(c.team1)).toHaveLength(1);
      // The roster offered to the user does not contain it, so the normal flow never gets here.
      expect((await roster(c.token, c.seasonId)).body.map((x: any) => x.id)).toEqual([ia.id]);
    });

    it('if the team already has a draft the cloning is rejected and nothing is created', async () => {
      const c = await context('cl-9@test.it');
      await createSeason(c.token, c.team1, { name: '2027/28' });
      const r = await clone(c.token, c.seasonId, []);
      expect([r.status, r.body.code]).toEqual([409, 'DRAFT_EXISTS']);
      expect(await seasonsOf(c.team1)).toHaveLength(2);
    });

    it('duplicates in the selection: 400', async () => {
      const c = await context('cl-7@test.it');
      const i = await enroll(c.token, c.seasonId, (await person(c.token, 'Anna')).id);
      const r = await clone(c.token, c.seasonId, [i.id, i.id]);
      expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATA']);
    });

    it('season of another club: 404', async () => {
      const c = await context('cl-8a@test.it');
      const other = await admin('cl-8b@test.it');
      const r = await clone(other.token, c.seasonId, []);
      expect([r.status, r.body.code]).toEqual([404, 'SEASON_NOT_FOUND']);
    });
  });

  describe('promotion between teams (rule 9)', () => {
    async function withADraftElsewhere(email: string) {
      const c = await context(email);
      const dest = (await createSeason(c.token, c.team2)).body;
      const p = await person(c.token, 'Luca');
      const i = await enroll(c.token, c.seasonId, p.id, { type: 'player', position: 'defender', jerseyNumber: 4 });
      return { ...c, destId: dest.id as string, person: p, enrollment: i };
    }

    it('creates the enrollment in the destination and leaves the source one open', async () => {
      const c = await withADraftElsewhere('pr-1@test.it');
      const r = await promote(c.token, c.enrollment.id, { seasonId: c.destId });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ seasonId: c.destId, personId: c.person.id, type: 'player', position: 'defender', jerseyNumber: 4, status: 'available', endedAt: null });
      expect(r.body.id).not.toBe(c.enrollment.id);
      expect((await roster(c.token, c.seasonId)).body).toHaveLength(1);
      expect((await roster(c.token, c.destId)).body).toHaveLength(1);
      expect(await audit('closed_enrollment', c.enrollment.id)).toHaveLength(0);
    });

    it('with closeSource closes the source enrollment and audits it', async () => {
      const c = await withADraftElsewhere('pr-2@test.it');
      const r = await promote(c.token, c.enrollment.id, { seasonId: c.destId, closeSource: true });
      expect(r.status).toBe(201);
      expect((await roster(c.token, c.seasonId)).body).toEqual([]);
      expect((await roster(c.token, c.destId)).body).toHaveLength(1);
      expect(await audit('closed_enrollment', c.enrollment.id)).toHaveLength(1);
    });

    it('position and jersey can be changed, the staff role applies to staff', async () => {
      const c = await withADraftElsewhere('pr-3@test.it');
      const r = await promote(c.token, c.enrollment.id, { seasonId: c.destId, position: 'midfielder', jerseyNumber: 8 });
      expect(r.body).toMatchObject({ position: 'midfielder', jerseyNumber: 8 });
      const s = await enroll(c.token, c.seasonId, (await person(c.token, 'Sara')).id, { type: 'staff', staffRole: 'assistant_coach' });
      const rs = await promote(c.token, s.id, { seasonId: c.destId, staffRole: 'coach' });
      expect(rs.body).toMatchObject({ type: 'staff', staffRole: { id: expect.any(String), name: 'Allenatore' }, position: null, jerseyNumber: null });
      const inconsistent = await promote(c.token, s.id, { seasonId: c.destId, jerseyNumber: 3 });
      expect([inconsistent.status, inconsistent.body.code]).toEqual([400, 'PLAYER_DATA_NOT_ALLOWED']);
    });

    it('the role of the origin travels even if archived since; choosing an archived one is refused', async () => {
      const c = await withADraftElsewhere('pr-9@test.it');
      const s = await enroll(c.token, c.seasonId, (await person(c.token, 'Sara')).id, { type: 'staff', staffRole: 'trainer' });
      const trainer = await roleId(t.req, c.token, 'trainer');
      expect((await t.req('PATCH', `/staff-roles/${trainer}`, { token: c.token, body: { archived: true } })).status).toBe(200);
      const carried = await promote(c.token, s.id, { seasonId: c.destId });
      expect([carried.status, carried.body.staffRole]).toEqual([201, { id: trainer, name: 'Preparatore' }]);
      const other = await enroll(c.token, c.seasonId, (await person(c.token, 'Tina')).id, { type: 'staff', staffRole: 'coach' });
      const chosen = await promote(c.token, other.id, { seasonId: c.destId, staffRoleId: trainer });
      expect([chosen.status, chosen.body.code]).toEqual([404, 'STAFF_ROLE_NOT_FOUND']);
    });

    describe('position and sport profile of the destination', () => {
      /** Destination team with a generic profile (no position). */
      async function towardsWithoutPositions(email: string) {
        const c = await withADraftElsewhere(email);
        const struct = await createTeams(t.req, c.token, { sportProfile: 'generic' });
        const sq = await struct.team('Group');
        const dest = (await createSeason(c.token, sq.id)).body;
        return { ...c, destGeneric: dest.id as string };
      }

      it('the inherited position drops to null if the destination does not provide it, the jersey stays', async () => {
        const c = await towardsWithoutPositions('pp-1@test.it');
        const r = await promote(c.token, c.enrollment.id, { seasonId: c.destGeneric });
        expect(r.status).toBe(201);
        expect(r.body).toMatchObject({ position: null, jerseyNumber: 4 });
      });

      it('the inherited position stays if the destination provides it', async () => {
        const c = await withADraftElsewhere('pp-2@test.it');
        expect((await promote(c.token, c.enrollment.id, { seasonId: c.destId })).body).toMatchObject({ position: 'defender' });
      });

      it('an explicit position not provided by the destination is rejected and creates nothing', async () => {
        const c = await towardsWithoutPositions('pp-3@test.it');
        const r = await promote(c.token, c.enrollment.id, { seasonId: c.destGeneric, position: 'goalkeeper' });
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_POSITION']);
        expect((await roster(c.token, c.destGeneric)).body).toEqual([]);
        const r2 = await promote(c.token, c.enrollment.id, { seasonId: c.destId, position: 'pivot' });
        expect([r2.status, r2.body.code]).toEqual([400, 'INVALID_POSITION']);
      });
    });

    it('same season, closed destination or already enrolled: rejected and the source does not change', async () => {
      const c = await withADraftElsewhere('pr-4@test.it');
      const same = await promote(c.token, c.enrollment.id, { seasonId: c.seasonId, closeSource: true });
      expect([same.status, same.body.code]).toEqual([409, 'PROMOTION_SAME_SEASON']);

      expect((await promote(c.token, c.enrollment.id, { seasonId: c.destId })).status).toBe(201);
      const double = await promote(c.token, c.enrollment.id, { seasonId: c.destId, closeSource: true });
      expect([double.status, double.body.code]).toEqual([409, 'ENROLLMENT_EXISTS']);

      await t.orm.em.fork().nativeUpdate(Season, { id: c.destId }, { status: 'closed' } as never, { filters: false });
      const closed = await promote(c.token, (await enroll(c.token, c.seasonId, (await person(c.token, 'Dario')).id)).id, { seasonId: c.destId });
      expect([closed.status, closed.body.code]).toEqual([409, 'SEASON_CLOSED']);
      expect(await audit('closed_enrollment', c.enrollment.id)).toHaveLength(0);
    });

    it('source already closed or in a closed season: rejected', async () => {
      const c = await withADraftElsewhere('pr-5@test.it');
      await t.req('POST', `/enrollments/${c.enrollment.id}/close`, { token: c.token });
      const r1 = await promote(c.token, c.enrollment.id, { seasonId: c.destId });
      expect([r1.status, r1.body.code]).toEqual([409, 'ENROLLMENT_CLOSED']);
      const i2 = await enroll(c.token, c.seasonId, (await person(c.token, 'Elisa')).id);
      await closeSeason(c.token, c.seasonId);
      const r2 = await promote(c.token, i2.id, { seasonId: c.destId });
      expect([r2.status, r2.body.code]).toEqual([409, 'SEASON_CLOSED']);
    });

    it('a disabled person cannot be promoted', async () => {
      const c = await withADraftElsewhere('pr-6@test.it');
      await t.req('POST', `/people/${c.person.id}/disable`, { token: c.token });
      const r = await promote(c.token, c.enrollment.id, { seasonId: c.destId });
      expect([r.status, r.body.code]).toEqual([409, 'PERSON_DISABLED']);
    });

    it('destination or enrollment of another club: 404', async () => {
      const c = await withADraftElsewhere('pr-7a@test.it');
      const other = await context('pr-7b@test.it');
      const r1 = await promote(c.token, c.enrollment.id, { seasonId: other.seasonId });
      expect([r1.status, r1.body.code]).toEqual([404, 'SEASON_NOT_FOUND']);
      const r2 = await promote(other.token, c.enrollment.id, { seasonId: other.seasonId });
      expect([r2.status, r2.body.code]).toEqual([404, 'ENROLLMENT_NOT_FOUND']);
    });
  });

  describe('permissions', () => {
    it('a non-admin gets 403 on closure, cloning and promotion', async () => {
      const c = await context('pe-1@test.it');
      const i = await enroll(c.token, c.seasonId, (await person(c.token, 'Anna')).id);
      await t.req('POST', '/invitations', { token: c.token, body: { email: 'pe-dir2@test.it', role: 'manager' } });
      const dir = await t.newUser('pe-dir2@test.it');
      const acc = await t.req('POST', '/invitations/accept', { token: dir.accessToken, body: { token: t.tokenInvitation('pe-dir2@test.it') } });
      const tk = acc.body.accessToken as string;
      const calls: [string, string, object?][] = [
        ['POST', `/seasons/${c.seasonId}/close`],
        ['POST', `/seasons/${c.seasonId}/clone`, { ...newSeason, enrollments: [i.id] }],
        ['POST', `/enrollments/${i.id}/promote`, { seasonId: c.seasonId }],
      ];
      for (const [m, u, body] of calls) {
        const r = await t.req(m, u, { token: tk, ...(body ? { body } : {}) });
        expect([m, u, r.status, r.body.code]).toEqual([m, u, 403, 'ADMIN_ONLY']);
      }
    });
  });
});
