import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment, createTeams, roleId } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('roster of the team for staff (#29)', () => {
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

  const post = async (token: string, url: string, body: object) => {
    const r = await t.req('POST', url, { token, body });
    expect(r.status).toBe(201);
    return r.body;
  };
  const get = (token: string, url: string) => t.req('GET', url, { token });
  async function accept(email: string) {
    const u = await t.newUser(email);
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
    expect(acc.status).toBe(200);
    return { token: acc.body.accessToken as string, userId: u.user.id as string };
  }

  /** Club with T1 and T2: coach and assistant of T1, coach of T2, a player with an account in T1, a player in T1 and T2, a disabled one. */
  async function club(email: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    const admin = c.body.accessToken as string;
    const struct = await createTeams(t.req, admin, { sportProfile: 'football' });
    const team = async (name: string) => {
      const sq = await struct.team(name);
      const st = await post(admin, `/teams/${sq.id}/seasons`, { name: 'Now', startDate: day(-60), endDate: day(400) });
      return st.id as string;
    };
    const s1 = await team('T1');
    const s2 = await team('T2');
    const person = (tag: string) => post(admin, '/people', { name: tag, surname: 'Rossi', birthDate: '1990-01-01', email: `${tag}-${email}` });
    const enroll = async (seasonId: string, personId: string, type: 'player' | 'staff', staffRole?: string) =>
      post(admin, `/seasons/${seasonId}/enrollments`, { personId, type, ...(staffRole ? { staffRoleId: await roleId(t.req, admin, staffRole) } : {}) });
    const withAccount = async (seasonId: string, tag: string, type: 'player' | 'staff', staffRole?: string) => {
      const p = await person(tag);
      await enroll(seasonId, p.id, type, staffRole);
      await post(admin, '/invitations', { email: `${tag}-${email}`, role: type, personId: p.id });
      return { ...(await accept(`${tag}-${email}`)), personId: p.id as string };
    };
    const coach1 = await withAccount(s1, 'c1', 'staff', 'coach');
    const assistant = await withAccount(s1, 'as', 'staff', 'assistant_coach');
    const coach2 = await withAccount(s2, 'c2', 'staff', 'coach');
    const player = await withAccount(s1, 'p1', 'player');
    const both = await person('both');
    await enroll(s1, both.id, 'player');
    await enroll(s2, both.id, 'player');
    await post(admin, `/people/${both.id}/certificates`, { type: 'competitive', issueDate: day(-10), expiryDate: day(365) });
    const gone = await person('gone');
    await enroll(s1, gone.id, 'player');
    expect((await t.req('POST', `/people/${gone.id}/disable`, { token: admin, body: {} })).status).toBe(200);
    for (const id of [s1, s2]) expect((await t.req('POST', `/seasons/${id}/active`, { token: admin })).status).toBe(200);
    return { admin, s1, s2, coach1, assistant, coach2, player };
  }

  type Row = { name: string; certificate: unknown; type: string; staffRole: { id: string; name: string } | null; status: string };

  it('the coach of the team reads the roster of the season with role, position, jersey and status', async () => {
    const c = await club('tr-1@test.it');
    const r = await get(c.coach1.token, `/seasons/${c.s1}/team-roster`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ teamName: 'T1', seasonName: 'Now', seasonStatus: 'active', canSetStatus: true });
    expect(r.body.rows.map((x: Row) => x.name).sort()).toEqual(['as', 'both', 'c1', 'p1']);
    expect(r.body.rows.find((x: Row) => x.name === 'c1')).toMatchObject({ type: 'staff', staffRole: { name: 'Allenatore' }, status: 'available' });
  });

  it('the assistant reads it but cannot set the state, and contacts never travel', async () => {
    const c = await club('tr-2@test.it');
    const r = await get(c.assistant.token, `/seasons/${c.s1}/team-roster`);
    expect(r.status).toBe(200);
    expect(r.body.canSetStatus).toBe(false);
    for (const row of r.body.rows) expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['email']));
    for (const row of r.body.rows) expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['phone']));
    for (const row of r.body.rows) expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['birthDate']));
  });

  it('with certificates.status the players carry the certificate summary', async () => {
    const c = await club('tr-3@test.it');
    const r = await get(c.coach1.token, `/seasons/${c.s1}/team-roster`);
    expect(r.body.canSeeCertificates).toBe(true);
    expect(r.body.rows.find((x: Row) => x.name === 'both').certificate).toMatchObject({ status: 'valid' });
  });

  it('without certificates.status the rows carry no certificate data', async () => {
    const c = await club('tr-4@test.it');
    const put = await t.req('PUT', `/permissions/${c.coach1.userId}`, { token: c.admin, body: { diff: { 'certificates.status': false } } });
    expect(put.status).toBe(200);
    const r = await get(c.coach1.token, `/seasons/${c.s1}/team-roster`);
    expect(r.status).toBe(200);
    expect(r.body.canSeeCertificates).toBe(false);
    for (const row of r.body.rows) expect(row.certificate).toBeNull();
  });

  it('staff of another team gets 404, as for an unknown season: players of other teams are not visible', async () => {
    const c = await club('tr-5@test.it');
    const r = await get(c.coach2.token, `/seasons/${c.s1}/team-roster`);
    expect([r.status, r.body.code]).toEqual([404, 'SEASON_NOT_FOUND']);
  });

  it('a player of the team is refused with 403, and another club gets 404', async () => {
    const c = await club('tr-6@test.it');
    const other = await club('tr-6b@test.it');
    const own = await get(c.player.token, `/seasons/${c.s1}/team-roster`);
    expect([own.status, own.body.code]).toEqual([403, 'PERMISSION_DENIED']);
    const foreign = await get(other.coach1.token, `/seasons/${c.s1}/team-roster`);
    expect([foreign.status, foreign.body.code]).toEqual([404, 'SEASON_NOT_FOUND']);
  });

  it('the admin reads it too, and disabled people are left out', async () => {
    const c = await club('tr-7@test.it');
    const r = await get(c.admin, `/seasons/${c.s1}/team-roster`);
    expect(r.status).toBe(200);
    expect(r.body.rows.map((x: Row) => x.name)).not.toContain('gone');
  });

  it('the events access flags the roster for who can read it', async () => {
    const c = await club('tr-8@test.it');
    const flag = async (token: string) => (await get(token, `/seasons/${c.s1}/events-access`)).body.canSeeRoster;
    expect([await flag(c.coach1.token), await flag(c.assistant.token), await flag(c.admin)]).toEqual([true, true, true]);
    expect(await flag(c.player.token)).toBe(false);
  });
});
