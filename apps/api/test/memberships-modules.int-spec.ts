import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment, createTeams } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('modules of the membership (menu of the personal pages)', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
    const em = t.orm.em.fork();
    em.create(SportProfile, { code: 'football', positions: [], starterBench: true, maxStarters: 11, modulesAvailable: ['attendances', 'standings', 'sanctions'] } as never);
    await em.flush();
  });
  afterAll(async () => {
    await t?.close();
  });

  const post = async (token: string, url: string, body: object) => {
    const r = await t.req('POST', url, { token, body });
    expect(r.status).toBe(201);
    return r.body;
  };

  it('lists the modules on in the teams of the open enrollments of the account, and nothing else', async () => {
    const s = await t.newUser('mod-admin@test.it');
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: 'Club Modules', acceptDpa: true } });
    const admin = c.body.accessToken as string;
    const struct = await createTeams(t.req, admin);
    const a = await struct.team('A', { modulesActive: ['attendances'] });
    const b = await struct.team('B', { modulesActive: ['sanctions', 'standings'] });
    const season = async (teamId: string) => (await post(admin, `/teams/${teamId}/seasons`, { name: 'Now', startDate: day(-60), endDate: day(400) })).id as string;
    const seasonA = await season(a.id);
    const seasonB = await season(b.id);

    const p = await post(admin, '/people', { name: 'Luca', surname: 'Rossi', birthDate: '1995-01-01', email: 'mod-player@test.it' });
    await post(admin, `/seasons/${seasonA}/enrollments`, { personId: p.id, type: 'player' });
    await post(admin, '/invitations', { email: 'mod-player@test.it', role: 'player', personId: p.id });
    const u = await t.newUser('mod-player@test.it');
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation('mod-player@test.it') } });
    expect(acc.status).toBe(200);
    const token = acc.body.accessToken as string;

    const mods = async (tk: string) => (await t.req('GET', '/auth/me', { token: tk })).body.memberships[0].modules;
    expect(await mods(token)).toEqual(['attendances']);

    await post(admin, `/seasons/${seasonB}/enrollments`, { personId: p.id, type: 'player' });
    expect(await mods(token)).toEqual(['attendances', 'sanctions', 'standings']);

    // An admin with no person record has no enrollment, so no module: the web shows no personal page to it anyway.
    expect(await mods(admin)).toEqual([]);
  });
});
