import { SportProfile } from '../src/entities/sport-profile.entity';
import { Season } from '../src/entities/season.entity';
import { Environment, startEnvironment } from './helpers';

describe('structure: sections, teams, seasons', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
    const em = t.orm.em.fork();
    em.create(SportProfile, {
      code: 'football',
      positions: ['goalkeeper', 'defender'],
      modulesAvailable: ['attendances', 'standings', 'sanctions'],
    } as never);
    await em.flush();
  });
  afterAll(async () => {
    await t?.close();
  });

  async function admin(email: string, clubName: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: clubName, acceptDpa: true } });
    expect(c.status).toBe(201);
    return { token: c.body.accessToken as string, clubId: c.body.activeClub.id as string };
  }

  const newSection = (token: string, name = 'Settore giovanile', extra: object = {}) =>
    t.req('POST', '/sections', { token, body: { name, ...extra } });
  const newTeam = (token: string, name = 'Under 15', extra: object = {}) =>
    t.req('POST', '/teams', { token, body: { name, sportProfile: 'football', ...extra } });
  const newSeason = (token: string, teamId: string, extra: object = {}) =>
    t.req('POST', `/teams/${teamId}/seasons`, {
      token,
      body: { name: '2026/27', startDate: '2026-09-01', endDate: '2027-06-30', ...extra },
    });

  describe('sport profiles', () => {
    it('lists profiles with code, positions, starters and modules, without texts', async () => {
      const a = await admin('ps-a@test.it', 'Club PS');
      const r = await t.req('GET', '/sport-profiles', { token: a.token });
      expect(r.status).toBe(200);
      expect(r.body).toEqual([
        { code: 'football', positions: ['goalkeeper', 'defender'], starterBench: false, maxStarters: null, modulesAvailable: ['attendances', 'standings', 'sanctions'], unitTerm: 'team', suggestedStaffRoles: [] },
      ]);
    });
  });

  describe('sections', () => {
    it('creates with the name only: the sport and the modules belong to the team', async () => {
      const a = await admin('sec-1@test.it', 'Club Sec 1');
      const r = await newSection(a.token);
      expect(r.status).toBe(201);
      expect(r.body).toEqual({ id: expect.any(String), name: 'Settore giovanile' });
    });

    it('a sport profile or modules on the section are refused', async () => {
      const a = await admin('sec-2@test.it', 'Club Sec 2');
      for (const extra of [{ sportProfile: 'football' }, { modulesActive: ['attendances'] }]) {
        const r = await newSection(a.token, 'Calcio', extra);
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATA']);
      }
    });

    it('duplicate name in the same club: 409, in another club no', async () => {
      const a = await admin('sec-4a@test.it', 'Club Sec 4A');
      const b = await admin('sec-4b@test.it', 'Club Sec 4B');
      expect((await newSection(a.token, 'Double')).status).toBe(201);
      const dup = await newSection(a.token, 'Double');
      expect([dup.status, dup.body.code]).toEqual([409, 'SECTION_EXISTS']);
      expect((await newSection(b.token, 'Double')).status).toBe(201);
    });

    it('renames, and refuses a name already taken', async () => {
      const a = await admin('sec-5@test.it', 'Club Sec 5');
      const { body } = await newSection(a.token, 'Old name');
      await newSection(a.token, 'Taken');
      const r = await t.req('PATCH', `/sections/${body.id}`, { token: a.token, body: { name: 'New name' } });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ id: body.id, name: 'New name' });
      const dup = await t.req('PATCH', `/sections/${body.id}`, { token: a.token, body: { name: 'Taken' } });
      expect([dup.status, dup.body.code]).toEqual([409, 'SECTION_EXISTS']);
    });

    it('validation: empty name or unknown fields', async () => {
      const a = await admin('sec-6@test.it', 'Club Sec 6');
      for (const body of [{ name: '' }, { name: 'X', club: 'other' }]) {
        const r = await t.req('POST', '/sections', { token: a.token, body });
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATA']);
      }
    });

    it('a section of another club: 404 on rename and delete', async () => {
      const a = await admin('sec-7a@test.it', 'Club Sec 7A');
      const b = await admin('sec-7b@test.it', 'Club Sec 7B');
      const s = (await newSection(a.token)).body;
      const rename = await t.req('PATCH', `/sections/${s.id}`, { token: b.token, body: { name: 'Hack' } });
      expect([rename.status, rename.body.code]).toEqual([404, 'SECTION_NOT_FOUND']);
      const del = await t.req('DELETE', `/sections/${s.id}`, { token: b.token });
      expect([del.status, del.body.code]).toEqual([404, 'SECTION_NOT_FOUND']);
    });

    it('deleting a section keeps its teams, now without a section', async () => {
      const a = await admin('sec-8@test.it', 'Club Sec 8');
      const s = (await newSection(a.token)).body;
      const sq = (await newTeam(a.token, 'Under 15', { sectionId: s.id })).body;
      expect(sq.sectionId).toBe(s.id);
      const del = await t.req('DELETE', `/sections/${s.id}`, { token: a.token });
      expect(del.status).toBe(204);
      const tree = (await t.req('GET', '/structure', { token: a.token })).body;
      expect(tree.sections).toEqual([]);
      expect(tree.teams).toEqual([expect.objectContaining({ id: sq.id, name: 'Under 15', sectionId: null })]);
    });

    it('deleting is refused while a role points to the section, and works once the role is gone', async () => {
      const a = await admin('sec-9@test.it', 'Club Sec 9');
      const s = (await newSection(a.token)).body;
      await t.req('POST', '/invitations', { token: a.token, body: { email: 'sec-9-dir@test.it', role: 'manager', scope: 'section', sectionId: s.id } });
      const dir = await t.newUser('sec-9-dir@test.it');
      await t.req('POST', '/invitations/accept', { token: dir.accessToken, body: { token: t.tokenInvitation('sec-9-dir@test.it') } });
      const refused = await t.req('DELETE', `/sections/${s.id}`, { token: a.token });
      expect([refused.status, refused.body.code]).toEqual([409, 'SECTION_IN_USE']);
      const roles = (await t.req('GET', '/roles', { token: a.token })).body as { id: string; sectionId: string | null }[];
      const role = roles.find((r) => r.sectionId === s.id);
      expect(role).toBeDefined();
      expect((await t.req('DELETE', `/roles/${role!.id}`, { token: a.token })).status).toBe(204);
      expect((await t.req('DELETE', `/sections/${s.id}`, { token: a.token })).status).toBe(204);
    });

    it('deleting is refused while an invitation is pending, and works once it is revoked', async () => {
      const a = await admin('sec-10@test.it', 'Club Sec 10');
      const s = (await newSection(a.token)).body;
      const inv = await t.req('POST', '/invitations', { token: a.token, body: { email: 'sec-10-dir@test.it', role: 'manager', scope: 'section', sectionId: s.id } });
      expect(inv.status).toBe(201);
      const refused = await t.req('DELETE', `/sections/${s.id}`, { token: a.token });
      expect([refused.status, refused.body.code]).toEqual([409, 'SECTION_IN_USE']);
      expect((await t.req('DELETE', `/invitations/${inv.body.id}`, { token: a.token })).status).toBe(204);
      expect((await t.req('DELETE', `/sections/${s.id}`, { token: a.token })).status).toBe(204);
    });
  });

  describe('teams', () => {
    it('creates without any section: only the discipline and the name are needed', async () => {
      const a = await admin('sq-0@test.it', 'Club Tm 0');
      const r = await newTeam(a.token, 'Prima squadra');
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ name: 'Prima squadra', sectionId: null, sportProfile: 'football', modulesActive: ['attendances', 'standings', 'sanctions'] });
      expect((await t.req('GET', '/structure', { token: a.token })).body.sections).toEqual([]);
    });

    it('creates inside a section, with sport profile, category and gender', async () => {
      const a = await admin('sq-1@test.it', 'Club Tm 1');
      const sec = (await newSection(a.token)).body;
      const r = await newTeam(a.token, 'Under 15', { sectionId: sec.id, category: 'Under 15', gender: 'male' });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ name: 'Under 15', category: 'Under 15', gender: 'male', sectionId: sec.id, sportProfile: 'football' });
    });

    it('the sport profile is required and must exist', async () => {
      const a = await admin('sq-6@test.it', 'Club Tm 6');
      const missing = await t.req('POST', '/teams', { token: a.token, body: { name: 'No sport' } });
      expect([missing.status, missing.body.code]).toEqual([400, 'INVALID_DATA']);
      const unknown = await newTeam(a.token, 'Curling', { sportProfile: 'curling' });
      expect([unknown.status, unknown.body.code]).toEqual([400, 'INVALID_SPORT_PROFILE']);
    });

    it('creates with the default modules of the profile, or with a subset', async () => {
      const a = await admin('sq-7@test.it', 'Club Tm 7');
      const all = await newTeam(a.token, 'All modules');
      expect(all.body.modulesActive).toEqual(['attendances', 'standings', 'sanctions']);
      const some = await newTeam(a.token, 'Attendances only', { modulesActive: ['attendances'] });
      expect(some.body.modulesActive).toEqual(['attendances']);
      const ko = await newTeam(a.token, 'Strange modules', { modulesActive: ['teleport'] });
      expect([ko.status, ko.body.code]).toEqual([400, 'INVALID_MODULES']);
    });

    it('edits the modules of one team without touching another team with the same sport', async () => {
      const a = await admin('sq-8@test.it', 'Club Tm 8');
      const one = (await newTeam(a.token, 'One')).body;
      const two = (await newTeam(a.token, 'Two')).body;
      const r = await t.req('PATCH', `/teams/${one.id}`, { token: a.token, body: { modulesActive: ['standings'] } });
      expect([r.status, r.body.modulesActive]).toEqual([200, ['standings']]);
      const bad = await t.req('PATCH', `/teams/${one.id}`, { token: a.token, body: { modulesActive: ['teleport'] } });
      expect([bad.status, bad.body.code]).toEqual([400, 'INVALID_MODULES']);
      const teams = (await t.req('GET', '/structure', { token: a.token })).body.teams as { id: string; modulesActive: string[] }[];
      expect(teams.find((x) => x.id === one.id)?.modulesActive).toEqual(['standings']);
      expect(teams.find((x) => x.id === two.id)?.modulesActive).toEqual(['attendances', 'standings', 'sanctions']);
    });

    it('the sport profile cannot be changed after creation', async () => {
      const a = await admin('sq-9@test.it', 'Club Tm 9');
      const sq = (await newTeam(a.token, 'Fixed sport')).body;
      const r = await t.req('PATCH', `/teams/${sq.id}`, { token: a.token, body: { sportProfile: 'generic' } });
      expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATA']);
    });

    it('duplicate name in the same section: 409; the same name in another section is fine', async () => {
      const a = await admin('sq-2@test.it', 'Club Tm 2');
      const first = (await newSection(a.token, 'First')).body;
      const second = (await newSection(a.token, 'Second')).body;
      expect((await newTeam(a.token, 'Under 17', { sectionId: first.id })).status).toBe(201);
      const dup = await newTeam(a.token, 'Under 17', { sectionId: first.id });
      expect([dup.status, dup.body.code]).toEqual([409, 'TEAM_EXISTS']);
      expect((await newTeam(a.token, 'Under 17', { sectionId: second.id })).status).toBe(201);
    });

    it('two teams without a section cannot share a name, nor can a rename produce one', async () => {
      const a = await admin('sq-2b@test.it', 'Club Tm 2B');
      expect((await newTeam(a.token, 'Under 19')).status).toBe(201);
      const dup = await newTeam(a.token, 'Under 19');
      expect([dup.status, dup.body.code]).toEqual([409, 'TEAM_EXISTS']);
      const other = (await newTeam(a.token, 'Under 20')).body;
      const rename = await t.req('PATCH', `/teams/${other.id}`, { token: a.token, body: { name: 'Under 19' } });
      expect([rename.status, rename.body.code]).toEqual([409, 'TEAM_EXISTS']);
    });

    it('the same name without a section in two clubs is fine', async () => {
      const a = await admin('sq-2c@test.it', 'Club Tm 2C');
      const b = await admin('sq-2d@test.it', 'Club Tm 2D');
      expect((await newTeam(a.token, 'Same')).status).toBe(201);
      expect((await newTeam(b.token, 'Same')).status).toBe(201);
    });

    it('a team moves into, between and out of sections', async () => {
      const a = await admin('sq-10@test.it', 'Club Tm 10');
      const first = (await newSection(a.token, 'First')).body;
      const second = (await newSection(a.token, 'Second')).body;
      const sq = (await newTeam(a.token, 'Movable')).body;
      const move = async (sectionId: string | null) =>
        (await t.req('PATCH', `/teams/${sq.id}`, { token: a.token, body: { sectionId } })).body.sectionId;
      expect(await move(first.id)).toBe(first.id);
      expect(await move(second.id)).toBe(second.id);
      expect(await move(null)).toBe(null);
    });

    it('moving into a section that already has that name is refused', async () => {
      const a = await admin('sq-11@test.it', 'Club Tm 11');
      const sec = (await newSection(a.token)).body;
      await newTeam(a.token, 'Under 15', { sectionId: sec.id });
      const loose = (await newTeam(a.token, 'Under 15')).body;
      const r = await t.req('PATCH', `/teams/${loose.id}`, { token: a.token, body: { sectionId: sec.id } });
      expect([r.status, r.body.code]).toEqual([409, 'TEAM_EXISTS']);
    });

    it('a section of another club: 404, on create and on move', async () => {
      const a = await admin('sq-3a@test.it', 'Club Tm 3A');
      const b = await admin('sq-3b@test.it', 'Club Tm 3B');
      const sec = (await newSection(a.token)).body;
      const r = await newTeam(b.token, 'Under 15', { sectionId: sec.id });
      expect([r.status, r.body.code]).toEqual([404, 'SECTION_NOT_FOUND']);
      const own = (await newTeam(b.token, 'Own')).body;
      const move = await t.req('PATCH', `/teams/${own.id}`, { token: b.token, body: { sectionId: sec.id } });
      expect([move.status, move.body.code]).toEqual([404, 'SECTION_NOT_FOUND']);
    });

    it('gender not allowed: 400', async () => {
      const a = await admin('sq-4@test.it', 'Club Tm 4');
      const r = await newTeam(a.token, 'X', { gender: 'alieno' });
      expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATA']);
    });

    it('edits name and category', async () => {
      const a = await admin('sq-5@test.it', 'Club Tm 5');
      const sq = (await newTeam(a.token, 'Under 13')).body;
      const r = await t.req('PATCH', `/teams/${sq.id}`, { token: a.token, body: { name: 'Under 14', category: 'Giovanissimi' } });
      expect(r.body).toMatchObject({ name: 'Under 14', category: 'Giovanissimi' });
      const other = await admin('sq-5b@test.it', 'Club Tm 5B');
      expect((await t.req('PATCH', `/teams/${sq.id}`, { token: other.token, body: { name: 'Hack' } })).status).toBe(404);
    });
  });

  describe('seasons', () => {
    async function team(email: string) {
      const a = await admin(email, `Club ${email}`);
      const sq = (await newTeam(a.token)).body;
      return { ...a, teamId: sq.id as string };
    }

    it('starts as a draft', async () => {
      const s = await team('st-1@test.it');
      const r = await newSeason(s.token, s.teamId, { league: 'Provinciale' });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ name: '2026/27', status: 'draft', startDate: '2026-09-01', endDate: '2027-06-30', league: 'Provinciale', teamId: s.teamId });
    });

    it('invalid period: end before start or nonexistent date', async () => {
      const s = await team('st-2@test.it');
      for (const extra of [{ startDate: '2027-07-01', endDate: '2027-06-30' }, { endDate: '2027-02-30' }]) {
        const r = await newSeason(s.token, s.teamId, extra);
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATE_SEASON']);
      }
    });

    it('activates a draft', async () => {
      const s = await team('st-3@test.it');
      const st = (await newSeason(s.token, s.teamId)).body;
      const r = await t.req('POST', `/seasons/${st.id}/active`, { token: s.token });
      expect([r.status, r.body.status]).toEqual([200, 'active']);
    });

    it('only one active season per team (rule 1)', async () => {
      const s = await team('st-4@test.it');
      const before = (await newSeason(s.token, s.teamId)).body;
      expect((await t.req('POST', `/seasons/${before.id}/active`, { token: s.token })).status).toBe(200);
      const second = (await newSeason(s.token, s.teamId, { name: '2027/28', startDate: '2027-09-01', endDate: '2028-06-30' })).body;
      const r = await t.req('POST', `/seasons/${second.id}/active`, { token: s.token });
      expect([r.status, r.body.code]).toEqual([409, 'ACTIVE_SEASON_EXISTS']);
    });

    it('only one draft per team: the second is rejected, another team or an activated draft free the slot', async () => {
      const s = await team('st-4b@test.it');
      const before = (await newSeason(s.token, s.teamId)).body;
      const double = await newSeason(s.token, s.teamId, { name: '2027/28' });
      expect([double.status, double.body.code]).toEqual([409, 'DRAFT_EXISTS']);
      const other = (await newTeam(s.token, 'Under 17')).body;
      expect((await newSeason(s.token, other.id)).status).toBe(201);
      await t.req('POST', `/seasons/${before.id}/active`, { token: s.token });
      expect((await newSeason(s.token, s.teamId, { name: '2027/28' })).status).toBe(201);
    });

    it('only a draft can be activated', async () => {
      const s = await team('st-5@test.it');
      const st = (await newSeason(s.token, s.teamId)).body;
      await t.req('POST', `/seasons/${st.id}/active`, { token: s.token });
      const r = await t.req('POST', `/seasons/${st.id}/active`, { token: s.token });
      expect([r.status, r.body.code]).toEqual([409, 'SEASON_NOT_ACTIVATABLE']);
    });

    it('edits name, dates and league of a non-closed season', async () => {
      const s = await team('st-6@test.it');
      const st = (await newSeason(s.token, s.teamId)).body;
      const r = await t.req('PATCH', `/seasons/${st.id}`, { token: s.token, body: { name: '2026-27', endDate: '2027-07-15' } });
      expect(r.body).toMatchObject({ name: '2026-27', endDate: '2027-07-15', startDate: '2026-09-01' });
    });

    it('the edit respects the period even with a single field', async () => {
      const s = await team('st-7@test.it');
      const st = (await newSeason(s.token, s.teamId)).body;
      const r = await t.req('PATCH', `/seasons/${st.id}`, { token: s.token, body: { endDate: '2026-08-01' } });
      expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATE_SEASON']);
    });

    it('a closed season is read-only (rule 7)', async () => {
      const s = await team('st-8@test.it');
      const st = (await newSeason(s.token, s.teamId)).body;
      await t.orm.em.fork().nativeUpdate(Season, { id: st.id }, { status: 'closed' } as never, { filters: false });
      const r = await t.req('PATCH', `/seasons/${st.id}`, { token: s.token, body: { name: 'Modified' } });
      expect([r.status, r.body.code]).toEqual([409, 'SEASON_CLOSED']);
    });

    it('season of another club: 404', async () => {
      const s = await team('st-9a@test.it');
      const other = await admin('st-9b@test.it', 'Club St 9B');
      const st = (await newSeason(s.token, s.teamId)).body;
      expect((await t.req('PATCH', `/seasons/${st.id}`, { token: other.token, body: { name: 'x' } })).status).toBe(404);
      expect((await t.req('POST', `/seasons/${st.id}/active`, { token: other.token })).status).toBe(404);
      expect((await newSeason(other.token, s.teamId)).status).toBe(404);
    });
  });

  describe('tree', () => {
    it('returns sections, teams and seasons of the club only', async () => {
      const a = await admin('alb-a@test.it', 'Club Alb A');
      const b = await admin('alb-b@test.it', 'Club Alb B');
      const sec = (await newSection(a.token, 'Youth')).body;
      const inSection = (await newTeam(a.token, 'Under 15', { sectionId: sec.id })).body;
      const loose = (await newTeam(a.token, 'Prima squadra')).body;
      await newSeason(a.token, inSection.id);
      await newSection(b.token, 'Other');
      await newTeam(b.token, 'Other team');

      const r = await t.req('GET', '/structure', { token: a.token });
      expect(r.status).toBe(200);
      expect(r.body.sections).toEqual([{ id: sec.id, name: 'Youth' }]);
      expect(r.body.teams).toHaveLength(2);
      const grouped = r.body.teams.find((x: { id: string }) => x.id === inSection.id);
      expect(grouped).toMatchObject({ name: 'Under 15', sectionId: sec.id, sportProfile: 'football', modulesActive: ['attendances', 'standings', 'sanctions'] });
      expect(grouped.seasons).toEqual([expect.objectContaining({ name: '2026/27', status: 'draft' })]);
      expect(r.body.teams.find((x: { id: string }) => x.id === loose.id)).toMatchObject({ sectionId: null, seasons: [] });
    });

    it('a club without sections is a flat list of teams', async () => {
      const a = await admin('alb-c@test.it', 'Club Alb C');
      await newTeam(a.token, 'Only team');
      const r = await t.req('GET', '/structure', { token: a.token });
      expect(r.body.sections).toEqual([]);
      expect(r.body.teams).toHaveLength(1);
    });
  });

  describe('permissions', () => {
    it('without a token: 401', async () => {
      for (const [m, u] of [['GET', '/structure'], ['POST', '/sections'], ['POST', '/teams'], ['GET', '/sport-profiles']] as const) {
        expect((await t.req(m, u)).status).toBe(401);
      }
    });

    it('a non-admin gets 403 on every structure route', async () => {
      const a = await admin('perm-a@test.it', 'Club Perm');
      const sec = (await newSection(a.token)).body;
      const sq = (await newTeam(a.token)).body;
      const st = (await newSeason(a.token, sq.id)).body;

      await t.req('POST', '/invitations', { token: a.token, body: { email: 'perm-dir@test.it', role: 'manager' } });
      const dir = await t.newUser('perm-dir@test.it');
      const acc = await t.req('POST', '/invitations/accept', { token: dir.accessToken, body: { token: t.tokenInvitation('perm-dir@test.it') } });
      const tk = acc.body.accessToken as string;

      const calls: [string, string, object?][] = [
        ['GET', '/structure'],
        ['POST', '/sections', { name: 'Z' }],
        ['PATCH', `/sections/${sec.id}`, { name: 'Z' }],
        ['DELETE', `/sections/${sec.id}`],
        ['POST', '/teams', { name: 'Z', sportProfile: 'football' }],
        ['PATCH', `/teams/${sq.id}`, { name: 'Z' }],
        ['POST', `/teams/${sq.id}/seasons`, { name: 'Z', startDate: '2026-09-01', endDate: '2027-06-30' }],
        ['PATCH', `/seasons/${st.id}`, { name: 'Z' }],
        ['POST', `/seasons/${st.id}/active`],
      ];
      for (const [m, u, body] of calls) {
        const r = await t.req(m, u, { token: tk, ...(body ? { body } : {}) });
        expect([m, u, r.status, r.body.code]).toEqual([m, u, 403, 'ADMIN_ONLY']);
      }
    });
  });
});
