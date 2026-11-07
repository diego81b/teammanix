import { Membership } from '../src/entities/membership.entity';
import { AuditLog } from '../src/entities/audit-log.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { POLICY } from '../src/permissions/policy';
import { Environment, startEnvironment } from './helpers';

describe('permissions (per-person policy)', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
    const em = t.orm.em.fork();
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

  async function withSeason(email: string) {
    const a = await admin(email);
    const act = (await t.req('POST', '/activities', { token: a.token, body: { name: 'Football', sportProfile: 'football' } })).body;
    const sq = (await t.req('POST', `/activities/${act.id}/teams`, { token: a.token, body: { name: 'Under 15' } })).body;
    const st = (await t.req('POST', `/teams/${sq.id}/seasons`, { token: a.token, body: { name: '2026/27', startDate: '2026-09-01', endDate: '2027-06-30' } })).body;
    return { ...a, seasonId: st.id as string, teamId: sq.id as string, activityId: act.id as string };
  }

  /** Invites `email` as manager or admin and has it accepted. */
  async function withRole(a: { token: string }, email: string, role: 'admin' | 'manager') {
    expect((await t.req('POST', '/invitations', { token: a.token, body: { email, role } })).status).toBe(201);
    const u = await t.newUser(email);
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
    expect(acc.status).toBe(200);
    return { token: acc.body.accessToken as string, userId: u.user.id as string };
  }

  /** Staff with an account: record, season enrollment with the given role, accepted invitation. */
  async function staff(a: { token: string; seasonId: string }, email: string, staffRole = 'coach') {
    const p = (await t.req('POST', '/people', { token: a.token, body: { name: 'Carlo', surname: 'Neri', birthDate: '1985-02-03', email } })).body;
    const i = await t.req('POST', `/seasons/${a.seasonId}/enrollments`, { token: a.token, body: { personId: p.id, type: 'staff', staffRole } });
    expect(i.status).toBe(201);
    expect((await t.req('POST', '/invitations', { token: a.token, body: { email, role: 'staff', personId: p.id } })).status).toBe(201);
    const u = await t.newUser(email);
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
    expect(acc.status).toBe(200);
    return { token: acc.body.accessToken as string, userId: u.user.id as string, personId: p.id as string, enrollmentId: i.body.id as string };
  }

  const list = (token: string) => t.req('GET', '/permissions', { token });
  const item = async (token: string, userId: string) => (await list(token)).body.find((x: { userId: string }) => x.userId === userId);
  const set = (token: string, userId: string, diff: unknown) => t.req('PUT', `/permissions/${userId}`, { token, body: { diff } });
  const audit = (action: string, entityId: string) => t.orm.em.fork().find(AuditLog, { action: action as never, entityId }, { filters: false });

  describe('list', () => {
    it('admin, manager and staff with an account; roles with scope and defaults', async () => {
      const a = await withSeason('pe-1@test.it');
      const dir = await withRole(a, 'pe-1dir@test.it', 'manager');
      const all = await staff(a, 'pe-1all@test.it', 'coach');

      const r = await list(a.token);
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(3);

      expect(await item(a.token, a.userId)).toMatchObject({
        email: 'pe-1@test.it',
        editable: false,
        diff: {},
        effective: [...POLICY],
        roles: [{ role: 'admin', scope: 'club', destination: null, season: null }],
      });
      expect(await item(a.token, dir.userId)).toMatchObject({
        editable: true,
        defaultValue: [],
        effective: [],
        roles: [{ role: 'manager', scope: 'club', destination: null, season: null }],
      });
      const s = await item(a.token, all.userId);
      expect(s).toMatchObject({
        editable: true,
        name: 'Mario',
        roles: [{ role: 'coach', scope: 'team', destination: 'Under 15', season: '2026/27' }],
      });
      expect(s.defaultValue).toEqual(POLICY.filter((p) => p !== 'people.disable' && p !== 'certificates.file'));
    });

    it('players, staff without an account, closed enrollments and disabled people do not appear', async () => {
      const a = await withSeason('pe-2@test.it');
      // Player with an account.
      const g = (await t.req('POST', '/people', { token: a.token, body: { name: 'Gigi', surname: 'Bianchi', birthDate: '2010-01-01', email: 'pe-2g@test.it' } })).body;
      await t.req('POST', `/seasons/${a.seasonId}/enrollments`, { token: a.token, body: { personId: g.id, type: 'player' } });
      await t.req('POST', '/invitations', { token: a.token, body: { email: 'pe-2g@test.it', role: 'player', personId: g.id } });
      const ug = await t.newUser('pe-2g@test.it');
      await t.req('POST', '/invitations/accept', { token: ug.accessToken, body: { token: t.tokenInvitation('pe-2g@test.it') } });
      // Staff without an account.
      const without = (await t.req('POST', '/people', { token: a.token, body: { name: 'Sara', email: 'pe-2s@test.it' } })).body;
      await t.req('POST', `/seasons/${a.seasonId}/enrollments`, { token: a.token, body: { personId: without.id, type: 'staff', staffRole: 'trainer' } });
      // Staff with a closed enrollment and disabled staff.
      const closed = await staff(a, 'pe-2c@test.it');
      await t.req('POST', `/enrollments/${closed.enrollmentId}/close`, { token: a.token });
      const disabled = await staff(a, 'pe-2d@test.it');
      await t.req('POST', `/people/${disabled.personId}/disable`, { token: a.token });

      expect((await list(a.token)).body.map((x: { userId: string }) => x.userId)).toEqual([a.userId]);
    });

    it('admin only, isolated by club', async () => {
      const a = await withSeason('pe-3a@test.it');
      const b = await admin('pe-3b@test.it');
      const dir = await withRole(a, 'pe-3dir@test.it', 'manager');
      expect((await list(dir.token)).status).toBe(403);
      expect((await t.req('GET', '/permissions')).status).toBe(401);
      expect((await list(b.token)).body.map((x: { userId: string }) => x.userId)).toEqual([b.userId]);
      expect((await set(dir.token, dir.userId, { 'people.manage': true })).status).toBe(403);
    });
  });

  describe('edit', () => {
    it('grants and revokes relative to the template; the response and the updated entry', async () => {
      const a = await withSeason('pe-4@test.it');
      const dir = await withRole(a, 'pe-4dir@test.it', 'manager');
      const all = await staff(a, 'pe-4all@test.it', 'trainer');

      const r = await set(a.token, dir.userId, { 'people.manage': true, 'events.manage': true });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ userId: dir.userId, diff: { 'people.manage': true, 'events.manage': true }, defaultValue: [] });
      expect(r.body.effective).toEqual(['events.manage', 'people.manage']);

      const s = await set(a.token, all.userId, { 'attendances.record': false });
      expect(s.body.effective).toEqual([]);
      expect((await item(a.token, all.userId)).diff).toEqual({ 'attendances.record': false });
      expect(await audit('policy_modified', dir.userId)).toHaveLength(1);
    });

    it('the new diff replaces the previous one; empty restores the defaults', async () => {
      const a = await withSeason('pe-5@test.it');
      const dir = await withRole(a, 'pe-5dir@test.it', 'manager');
      await set(a.token, dir.userId, { 'people.manage': true });
      await set(a.token, dir.userId, { 'events.manage': true });
      expect((await item(a.token, dir.userId)).diff).toEqual({ 'events.manage': true });
      const r = await set(a.token, dir.userId, {});
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ diff: {}, effective: [] });
      expect(await t.orm.em.fork().count(Membership, { user: dir.userId }, { filters: false })).toBe(0);
    });

    it('invalid keys or values: 400 with code', async () => {
      const a = await withSeason('pe-6@test.it');
      const dir = await withRole(a, 'pe-6dir@test.it', 'manager');
      for (const diff of [{ 'cose.strane': true }, { 'people.manage': 'si' }, { 'people.manage': null }]) {
        const r = await set(a.token, dir.userId, diff);
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_POLICY']);
      }
      for (const diff of ['x', 3, [], null]) expect((await set(a.token, dir.userId, diff)).status).toBe(400);
      expect((await t.req('PUT', `/permissions/${dir.userId}`, { token: a.token, body: {} })).status).toBe(400);
    });

    it('the admin policies are untouchable', async () => {
      const a = await withSeason('pe-7@test.it');
      const r = await set(a.token, a.userId, { 'people.manage': false });
      expect([r.status, r.body.code]).toEqual([409, 'POLICY_ADMIN_NOT_EDITABLE']);
      // Also holds for someone who is admin and also staff or manager.
      const b = await withRole(a, 'pe-7b@test.it', 'admin');
      expect((await set(a.token, b.userId, { 'people.manage': false })).status).toBe(409);
    });

    it('someone without access in this club, or nonexistent, or from another club: 404', async () => {
      const a = await withSeason('pe-8a@test.it');
      const b = await withSeason('pe-8b@test.it');
      const dirB = await withRole(b, 'pe-8dir@test.it', 'manager');
      for (const id of [dirB.userId, crypto.randomUUID()]) {
        const r = await set(a.token, id, { 'people.manage': true });
        expect([r.status, r.body.code]).toEqual([404, 'ACCESS_NOT_FOUND']);
      }
      expect((await set(a.token, 'not-a-uuid', {})).status).toBe(400);
      // A player or a disabled person has no policies to manage.
      const disabled = await staff(a, 'pe-8d@test.it');
      await t.req('POST', `/people/${disabled.personId}/disable`, { token: a.token });
      expect((await set(a.token, disabled.userId, { 'people.manage': true })).status).toBe(404);
    });
  });

  describe('diff lifecycle', () => {
    it('leaving the club deletes the policies', async () => {
      const a = await withSeason('pe-9@test.it');
      const dir = await withRole(a, 'pe-9dir@test.it', 'manager');
      await set(a.token, dir.userId, { 'people.manage': true });
      expect((await t.req('POST', '/club/current/detachment', { token: dir.token })).status).toBe(200);
      expect(await t.orm.em.fork().count(Membership, { user: dir.userId }, { filters: false })).toBe(0);
    });

    it('removing the last role deletes the policies: a new invitation restarts from the defaults', async () => {
      const a = await withSeason('pe-10@test.it');
      const dir = await withRole(a, 'pe-10dir@test.it', 'manager');
      await set(a.token, dir.userId, { 'people.manage': true });
      const role = (await t.req('GET', '/roles', { token: a.token })).body.find((x: { userId: string }) => x.userId === dir.userId);
      expect((await t.req('DELETE', `/roles/${role.id}`, { token: a.token })).status).toBe(204);
      expect(await t.orm.em.fork().count(Membership, { user: dir.userId }, { filters: false })).toBe(0);
    });

    it('removing a role when another remains keeps the policies', async () => {
      const a = await withSeason('pe-11@test.it');
      const dir = await withRole(a, 'pe-11dir@test.it', 'manager');
      // Second role: manager limited to one team.
      await t.req('POST', '/invitations', { token: a.token, body: { email: 'pe-11dir@test.it', role: 'manager', scope: 'team', teamId: a.teamId } });
      const login = await t.req('POST', '/auth/login', { body: { email: 'pe-11dir@test.it', password: 'password-long-123' } });
      expect((await t.req('POST', '/invitations/accept', { token: login.body.accessToken, body: { token: t.tokenInvitation('pe-11dir@test.it') } })).status).toBe(200);
      await set(a.token, dir.userId, { 'people.manage': true });
      const roles = (await t.req('GET', '/roles', { token: a.token })).body.filter((x: { userId: string }) => x.userId === dir.userId);
      expect(roles).toHaveLength(2);
      expect((await t.req('DELETE', `/roles/${roles[0].id}`, { token: a.token })).status).toBe(204);
      expect((await item(a.token, dir.userId)).diff).toEqual({ 'people.manage': true });
    });
  });
});
