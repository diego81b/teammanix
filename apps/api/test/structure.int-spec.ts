import { SportProfile } from '../src/entities/sport-profile.entity';
import { Season } from '../src/entities/season.entity';
import { Environment, startEnvironment } from './helpers';

describe('structure: activities, teams, seasons', () => {
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

  const newActivity = (token: string, name = 'Calcio giovanile', extra: object = {}) =>
    t.req('POST', '/activities', { token, body: { name, sportProfile: 'football', ...extra } });
  const newTeam = (token: string, activityId: string, name = 'Under 15', extra: object = {}) =>
    t.req('POST', `/activities/${activityId}/teams`, { token, body: { name, ...extra } });
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
        { code: 'football', positions: ['goalkeeper', 'defender'], starterBench: false, maxStarters: null, modulesAvailable: ['attendances', 'standings', 'sanctions'] },
      ]);
    });
  });

  describe('activities', () => {
    it('creates with the default profile modules', async () => {
      const a = await admin('act-1@test.it', 'Club Act 1');
      const r = await newActivity(a.token);
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ name: 'Calcio giovanile', sportProfile: 'football', modulesActive: ['attendances', 'standings', 'sanctions'] });
    });

    it('active modules: only a subset of the profile\'s', async () => {
      const a = await admin('act-2@test.it', 'Club Act 2');
      const ok = await newActivity(a.token, 'Solo presenze', { modulesActive: ['attendances'] });
      expect(ok.body.modulesActive).toEqual(['attendances']);
      const ko = await newActivity(a.token, 'Moduli strani', { modulesActive: ['teletrasporto'] });
      expect([ko.status, ko.body.code]).toEqual([400, 'INVALID_MODULES']);
    });

    it('nonexistent sport profile', async () => {
      const a = await admin('act-3@test.it', 'Club Act 3');
      const r = await t.req('POST', '/activities', { token: a.token, body: { name: 'X', sportProfile: 'curling' } });
      expect([r.status, r.body.code]).toEqual([400, 'INVALID_SPORT_PROFILE']);
    });

    it('duplicate name in the same club: 409, in another club no', async () => {
      const a = await admin('act-4a@test.it', 'Club Act 4A');
      const b = await admin('act-4b@test.it', 'Club Act 4B');
      expect((await newActivity(a.token, 'Double')).status).toBe(201);
      const dup = await newActivity(a.token, 'Double');
      expect([dup.status, dup.body.code]).toEqual([409, 'ACTIVITY_EXISTS']);
      expect((await newActivity(b.token, 'Double')).status).toBe(201);
    });

    it('renames and changes the modules', async () => {
      const a = await admin('act-5@test.it', 'Club Act 5');
      const { body } = await newActivity(a.token, 'Old name');
      const r = await t.req('PATCH', `/activities/${body.id}`, { token: a.token, body: { name: 'New name', modulesActive: ['attendances'] } });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ name: 'New name', modulesActive: ['attendances'] });
    });

    it('validation: empty name or unknown fields', async () => {
      const a = await admin('act-6@test.it', 'Club Act 6');
      for (const body of [{ name: '', sportProfile: 'football' }, { name: 'X', sportProfile: 'football', club: 'other' }]) {
        const r = await t.req('POST', '/activities', { token: a.token, body });
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATA']);
      }
    });
  });

  describe('teams', () => {
    it('creates inside an activity, with category and gender', async () => {
      const a = await admin('sq-1@test.it', 'Club Tm 1');
      const act = (await newActivity(a.token)).body;
      const r = await newTeam(a.token, act.id, 'Under 15', { category: 'Under 15', gender: 'male' });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ name: 'Under 15', category: 'Under 15', gender: 'male', activityId: act.id });
    });

    it('duplicate name in the same activity: 409', async () => {
      const a = await admin('sq-2@test.it', 'Club Tm 2');
      const act = (await newActivity(a.token)).body;
      await newTeam(a.token, act.id, 'Under 17');
      const dup = await newTeam(a.token, act.id, 'Under 17');
      expect([dup.status, dup.body.code]).toEqual([409, 'TEAM_EXISTS']);
    });

    it('activity of another club: 404', async () => {
      const a = await admin('sq-3a@test.it', 'Club Tm 3A');
      const b = await admin('sq-3b@test.it', 'Club Tm 3B');
      const act = (await newActivity(a.token)).body;
      const r = await newTeam(b.token, act.id);
      expect([r.status, r.body.code]).toEqual([404, 'ACTIVITY_NOT_FOUND']);
    });

    it('gender not allowed: 400', async () => {
      const a = await admin('sq-4@test.it', 'Club Tm 4');
      const act = (await newActivity(a.token)).body;
      const r = await newTeam(a.token, act.id, 'X', { gender: 'alieno' });
      expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATA']);
    });

    it('edits name and category', async () => {
      const a = await admin('sq-5@test.it', 'Club Tm 5');
      const act = (await newActivity(a.token)).body;
      const sq = (await newTeam(a.token, act.id, 'Under 13')).body;
      const r = await t.req('PATCH', `/teams/${sq.id}`, { token: a.token, body: { name: 'Under 14', category: 'Giovanissimi' } });
      expect(r.body).toMatchObject({ name: 'Under 14', category: 'Giovanissimi' });
      const other = await admin('sq-5b@test.it', 'Club Tm 5B');
      expect((await t.req('PATCH', `/teams/${sq.id}`, { token: other.token, body: { name: 'Hack' } })).status).toBe(404);
    });
  });

  describe('seasons', () => {
    async function team(email: string) {
      const a = await admin(email, `Club ${email}`);
      const act = (await newActivity(a.token)).body;
      const sq = (await newTeam(a.token, act.id)).body;
      return { ...a, activityId: act.id as string, teamId: sq.id as string };
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
      const other = (await newTeam(s.token, s.activityId, 'Under 17')).body;
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
    it('returns activities, teams and seasons of the club only', async () => {
      const a = await admin('alb-a@test.it', 'Club Alb A');
      const b = await admin('alb-b@test.it', 'Club Alb B');
      const act = (await newActivity(a.token, 'Football')).body;
      const sq = (await newTeam(a.token, act.id, 'Under 15')).body;
      await newSeason(a.token, sq.id);
      await newActivity(b.token, 'Other');

      const r = await t.req('GET', '/structure', { token: a.token });
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(1);
      expect(r.body[0]).toMatchObject({ id: act.id, name: 'Football', sportProfile: 'football' });
      expect(r.body[0].teams).toHaveLength(1);
      expect(r.body[0].teams[0]).toMatchObject({ id: sq.id, name: 'Under 15' });
      expect(r.body[0].teams[0].seasons).toEqual([expect.objectContaining({ name: '2026/27', status: 'draft' })]);
    });
  });

  describe('permissions', () => {
    it('without a token: 401', async () => {
      for (const [m, u] of [['GET', '/structure'], ['POST', '/activities'], ['GET', '/sport-profiles']] as const) {
        expect((await t.req(m, u)).status).toBe(401);
      }
    });

    it('a non-admin gets 403 on every structure route', async () => {
      const a = await admin('perm-a@test.it', 'Club Perm');
      const act = (await newActivity(a.token)).body;
      const sq = (await newTeam(a.token, act.id)).body;
      const st = (await newSeason(a.token, sq.id)).body;

      await t.req('POST', '/invitations', { token: a.token, body: { email: 'perm-dir@test.it', role: 'manager' } });
      const dir = await t.newUser('perm-dir@test.it');
      const acc = await t.req('POST', '/invitations/accept', { token: dir.accessToken, body: { token: t.tokenInvitation('perm-dir@test.it') } });
      const tk = acc.body.accessToken as string;

      const calls: [string, string, object?][] = [
        ['GET', '/structure'],
        ['POST', '/activities', { name: 'Z', sportProfile: 'football' }],
        ['PATCH', `/activities/${act.id}`, { name: 'Z' }],
        ['POST', `/activities/${act.id}/teams`, { name: 'Z' }],
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
