import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment, createTeams, defaultRoles } from './helpers';

describe('staff roles: the catalog owned by the club', () => {
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

  async function admin(email: string, language?: string) {
    const s = await t.newUser(email);
    if (language) expect((await t.req('PATCH', '/auth/language', { token: s.accessToken, body: { language } })).status).toBe(200);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    return { token: c.body.accessToken as string, clubId: c.body.activeClub.id as string };
  }

  const create = (token: string, body: object) => t.req('POST', '/staff-roles', { token, body });
  const list = async (token: string) => (await t.req('GET', '/staff-roles', { token })).body as Array<{ id: string; name: string; policyModel: string; mustBeAvailable: boolean; archived: boolean }>;

  async function withSeason(email: string) {
    const a = await admin(email);
    const team = await (await createTeams(t.req, a.token, { sportProfile: 'football' })).team('Under 15');
    const season = await t.req('POST', `/teams/${team.id}/seasons`, { token: a.token, body: { name: '2026/27', startDate: '2026-09-01', endDate: '2027-06-30' } });
    const person = await t.req('POST', '/people', { token: a.token, body: { name: 'Carlo', surname: 'Neri', birthDate: '1985-02-03', email: `carlo-${email}` } });
    const enroll = (staffRoleId: string | undefined, personId = person.body.id as string) =>
      t.req('POST', `/seasons/${season.body.id}/enrollments`, { token: a.token, body: { personId, type: 'staff', ...(staffRoleId ? { staffRoleId } : {}) } });
    return { ...a, seasonId: season.body.id as string, personId: person.body.id as string, enroll };
  }

  describe('defaults', () => {
    it('a new club has five roles in the language of the creator, only the coach must be available', async () => {
      const a = await admin('sr-1@test.it');
      const roles = await list(a.token);
      expect(roles.map((r) => [r.name, r.policyModel, r.mustBeAvailable, r.archived])).toEqual([
        ['Allenatore', 'coach', true, false],
        ['Vice allenatore', 'assistant_coach', false, false],
        ['Preparatore', 'trainer', false, false],
        ['Accompagnatore', 'none', false, false],
        ['Altro', 'none', false, false],
      ]);
    });

    it('names follow the language of the creator at that moment and are not translated afterwards', async () => {
      const a = await admin('sr-2@test.it', 'en');
      expect((await list(a.token)).map((r) => r.name)).toEqual(['Coach', 'Assistant coach', 'Trainer', 'Team official', 'Other']);
      const fr = await admin('sr-2fr@test.it', 'fr');
      expect((await list(fr.token))[0]?.name).toBe('Entraîneur');
      await t.req('PATCH', '/auth/language', { token: fr.token, body: { language: 'it' } });
      expect((await list(fr.token))[0]?.name).toBe('Entraîneur');
    });

    it('every club has its own catalog', async () => {
      const a = await admin('sr-3a@test.it');
      const b = await admin('sr-3b@test.it');
      const ids = new Set([...(await list(a.token)), ...(await list(b.token))].map((r) => r.id));
      expect(ids.size).toBe(10);
    });
  });

  describe('create and edit', () => {
    it('the admin adds a role with a permission model and a must be available flag', async () => {
      const a = await admin('sr-4@test.it');
      const r = await create(a.token, { name: 'Maestro', policyModel: 'coach', mustBeAvailable: true });
      expect(r.status).toBe(201);
      expect(r.body).toEqual({ id: expect.any(String), name: 'Maestro', policyModel: 'coach', mustBeAvailable: true, archived: false });
      expect((await list(a.token)).map((x) => x.name)).toContain('Maestro');
    });

    it('must be available defaults to false', async () => {
      const a = await admin('sr-5@test.it');
      const r = await create(a.token, { name: 'Istruttore', policyModel: 'trainer' });
      expect([r.status, r.body.mustBeAvailable]).toEqual([201, false]);
    });

    it('a name that differs only by case, accents or spaces is a duplicate; another club may use it', async () => {
      const a = await admin('sr-6a@test.it');
      const b = await admin('sr-6b@test.it');
      expect((await create(a.token, { name: 'Maestro', policyModel: 'coach' })).status).toBe(201);
      for (const name of ['maestro', 'MAESTRO', ' Maestro ', 'ALLENATORE', 'Vice  Allenatore']) {
        const dup = await create(a.token, { name, policyModel: 'none' });
        expect([name, dup.status, dup.body.code]).toEqual([name, 409, 'STAFF_ROLE_EXISTS']);
      }
      expect((await create(b.token, { name: 'Maestro', policyModel: 'coach' })).status).toBe(201);
    });

    it('invalid data is refused: name length, permission model, flag, unknown fields', async () => {
      const a = await admin('sr-7@test.it');
      for (const body of [
        { name: '', policyModel: 'coach' },
        { name: ' ', policyModel: 'coach' },
        { name: 'x'.repeat(61), policyModel: 'coach' },
        { name: 'Maestro' },
        { name: 'Maestro', policyModel: 'escort' },
        { name: 'Maestro', policyModel: 'coach', mustBeAvailable: 'si' },
        { name: 'Maestro', policyModel: 'coach', club: 'x' },
      ]) {
        const r = await create(a.token, body);
        expect([JSON.stringify(body), r.status, r.body.code]).toEqual([JSON.stringify(body), 400, 'INVALID_DATA']);
      }
      expect((await create(a.token, { name: 'x'.repeat(60), policyModel: 'coach' })).status).toBe(201);
    });

    it('edits name, model and flag at any time, even when the role is in use', async () => {
      const s = await withSeason('sr-8@test.it');
      const coach = (await defaultRoles(t.req, s.token)).coach;
      expect((await s.enroll(coach)).status).toBe(201);
      const r = await t.req('PATCH', `/staff-roles/${coach}`, { token: s.token, body: { name: 'Mister', policyModel: 'assistant_coach', mustBeAvailable: false } });
      expect([r.status, r.body]).toEqual([200, { id: coach, name: 'Mister', policyModel: 'assistant_coach', mustBeAvailable: false, archived: false }]);
    });

    it('renaming to a name already taken is refused, keeping the own name is fine', async () => {
      const a = await admin('sr-9@test.it');
      const roles = await list(a.token);
      const dup = await t.req('PATCH', `/staff-roles/${roles[1]?.id}`, { token: a.token, body: { name: 'allenatore' } });
      expect([dup.status, dup.body.code]).toEqual([409, 'STAFF_ROLE_EXISTS']);
      const same = await t.req('PATCH', `/staff-roles/${roles[1]?.id}`, { token: a.token, body: { name: 'Vice Allenatore' } });
      expect([same.status, same.body.name]).toEqual([200, 'Vice Allenatore']);
    });

    it('an empty edit is refused', async () => {
      const a = await admin('sr-10@test.it');
      const r = await t.req('PATCH', `/staff-roles/${(await list(a.token))[0]?.id}`, { token: a.token, body: {} });
      expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATA']);
    });
  });

  describe('archive and delete', () => {
    it('archives and restores: the role is still listed, flagged', async () => {
      const a = await admin('sr-11@test.it');
      const id = (await list(a.token))[4]?.id;
      expect((await t.req('PATCH', `/staff-roles/${id}`, { token: a.token, body: { archived: true } })).body.archived).toBe(true);
      expect((await list(a.token)).find((r) => r.id === id)?.archived).toBe(true);
      expect((await t.req('PATCH', `/staff-roles/${id}`, { token: a.token, body: { archived: false } })).body.archived).toBe(false);
    });

    it('an unused role is deleted; a role used by an enrollment is refused with STAFF_ROLE_IN_USE', async () => {
      const s = await withSeason('sr-12@test.it');
      const roles = await defaultRoles(t.req, s.token);
      expect((await s.enroll(roles.trainer)).status).toBe(201);
      const used = await t.req('DELETE', `/staff-roles/${roles.trainer}`, { token: s.token });
      expect([used.status, used.body.code]).toEqual([409, 'STAFF_ROLE_IN_USE']);
      const free = await t.req('DELETE', `/staff-roles/${roles.other}`, { token: s.token });
      expect(free.status).toBe(204);
      expect((await list(s.token)).map((r) => r.id)).not.toContain(roles.other);
    });

    it('a closed enrollment still uses the role', async () => {
      const s = await withSeason('sr-13@test.it');
      const roles = await defaultRoles(t.req, s.token);
      const i = await s.enroll(roles.escort);
      await t.req('POST', `/enrollments/${i.body.id}/close`, { token: s.token });
      const r = await t.req('DELETE', `/staff-roles/${roles.escort}`, { token: s.token });
      expect([r.status, r.body.code]).toEqual([409, 'STAFF_ROLE_IN_USE']);
    });

    it('a role of another club is not found, for read, edit and delete', async () => {
      const a = await admin('sr-14a@test.it');
      const b = await admin('sr-14b@test.it');
      const foreign = (await list(b.token))[0]?.id;
      for (const [method, body] of [['PATCH', { name: 'X' }], ['DELETE', undefined]] as const) {
        const r = await t.req(method, `/staff-roles/${foreign}`, { token: a.token, ...(body ? { body } : {}) });
        expect([method, r.status, r.body.code]).toEqual([method, 404, 'STAFF_ROLE_NOT_FOUND']);
      }
      const missing = await t.req('DELETE', '/staff-roles/00000000-0000-4000-8000-000000000000', { token: a.token });
      expect([missing.status, missing.body.code]).toEqual([404, 'STAFF_ROLE_NOT_FOUND']);
      expect((await t.req('DELETE', '/staff-roles/nope', { token: a.token })).status).toBe(400);
    });
  });

  describe('permissions', () => {
    it('any member reads the catalog, only the admin changes it', async () => {
      const a = await admin('sr-15@test.it');
      const roles = await list(a.token);
      await t.req('POST', '/invitations', { token: a.token, body: { email: 'sr-15m@test.it', role: 'manager' } });
      const m = await t.newUser('sr-15m@test.it');
      expect((await t.req('POST', '/invitations/accept', { token: m.accessToken, body: { token: t.tokenInvitation('sr-15m@test.it') } })).status).toBe(200);
      const login = await t.req('POST', '/auth/login', { body: { email: 'sr-15m@test.it', password: 'password-long-123' } });
      const token = login.body.accessToken as string;
      const read = await t.req('GET', '/staff-roles', { token });
      expect([read.status, read.body.length]).toEqual([200, 5]);
      for (const [method, url, body] of [
        ['POST', '/staff-roles', { name: 'Maestro', policyModel: 'coach' }],
        ['PATCH', `/staff-roles/${roles[0]?.id}`, { name: 'X' }],
        ['DELETE', `/staff-roles/${roles[4]?.id}`, undefined],
      ] as const) {
        const r = await t.req(method, url, { token, ...(body ? { body } : {}) });
        expect([method, r.status, r.body.code]).toEqual([method, 403, 'ADMIN_ONLY']);
      }
      expect((await list(a.token)).map((r) => r.name)).not.toContain('Maestro');
    });

    it('without a token or without a club: refused', async () => {
      expect((await t.req('GET', '/staff-roles')).status).toBe(401);
      const s = await t.newUser('sr-16@test.it');
      expect((await t.req('GET', '/staff-roles', { token: s.accessToken })).status).toBe(403);
    });
  });

  describe('enrollments use the catalog', () => {
    it('staff is enrolled with a role id and the answers show id and name', async () => {
      const s = await withSeason('sr-17@test.it');
      const roles = await defaultRoles(t.req, s.token);
      const r = await s.enroll(roles.coach);
      expect(r.status).toBe(201);
      expect(r.body.staffRole).toEqual({ id: roles.coach, name: 'Allenatore' });
    });

    it('a role of another club or an unknown id is refused with STAFF_ROLE_NOT_FOUND', async () => {
      const s = await withSeason('sr-18@test.it');
      const other = await admin('sr-18b@test.it');
      for (const id of [(await list(other.token))[0]?.id, '00000000-0000-4000-8000-000000000000']) {
        const r = await s.enroll(id);
        expect([r.status, r.body.code]).toEqual([404, 'STAFF_ROLE_NOT_FOUND']);
      }
      const bad = await s.enroll('nope');
      expect([bad.status, bad.body.code]).toEqual([400, 'INVALID_DATA']);
    });

    it('an archived role cannot be chosen for a new enrollment or an edit, but stays on the existing ones', async () => {
      const s = await withSeason('sr-19@test.it');
      const roles = await defaultRoles(t.req, s.token);
      const first = await s.enroll(roles.assistant_coach);
      await t.req('PATCH', `/staff-roles/${roles.assistant_coach}`, { token: s.token, body: { archived: true } });

      const other = await t.req('POST', '/people', { token: s.token, body: { name: 'Anna', surname: 'Verdi', birthDate: '1990-01-01', email: 'anna.verdi@test.it' } });
      const refused = await s.enroll(roles.assistant_coach, other.body.id);
      expect([refused.status, refused.body.code]).toEqual([404, 'STAFF_ROLE_NOT_FOUND']);

      const switched = await t.req('PATCH', `/enrollments/${first.body.id}`, { token: s.token, body: { staffRoleId: roles.coach } });
      expect([switched.status, switched.body.staffRole]).toEqual([200, { id: roles.coach, name: 'Allenatore' }]);
      const back = await t.req('PATCH', `/enrollments/${first.body.id}`, { token: s.token, body: { staffRoleId: roles.assistant_coach } });
      expect([back.status, back.body.code]).toEqual([404, 'STAFF_ROLE_NOT_FOUND']);
    });

    it('editing an enrollment without touching the role keeps an archived role', async () => {
      const s = await withSeason('sr-20@test.it');
      const roles = await defaultRoles(t.req, s.token);
      const i = await s.enroll(roles.trainer);
      await t.req('PATCH', `/staff-roles/${roles.trainer}`, { token: s.token, body: { archived: true } });
      const same = await t.req('PATCH', `/enrollments/${i.body.id}`, { token: s.token, body: { staffRoleId: roles.trainer } });
      expect([same.status, same.body.staffRole]).toEqual([200, { id: roles.trainer, name: 'Preparatore' }]);
      const status = await t.req('PATCH', `/enrollments/${i.body.id}`, { token: s.token, body: { status: 'injured' } });
      expect([status.status, status.body.staffRole]).toEqual([200, { id: roles.trainer, name: 'Preparatore' }]);
      const roster = await t.req('GET', `/seasons/${s.seasonId}/roster`, { token: s.token });
      expect(roster.body[0].staffRole).toEqual({ id: roles.trainer, name: 'Preparatore' });
    });

    it('renaming a role shows the new name on the enrollments that have it', async () => {
      const s = await withSeason('sr-21@test.it');
      const roles = await defaultRoles(t.req, s.token);
      await s.enroll(roles.coach);
      await t.req('PATCH', `/staff-roles/${roles.coach}`, { token: s.token, body: { name: 'Maestro' } });
      const roster = await t.req('GET', `/seasons/${s.seasonId}/roster`, { token: s.token });
      expect(roster.body[0].staffRole).toEqual({ id: roles.coach, name: 'Maestro' });
    });
  });
});
