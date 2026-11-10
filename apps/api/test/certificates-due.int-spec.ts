import { AuditLog } from '../src/entities/audit-log.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('certificates due, for staff', () => {
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

  const post = async (token: string, url: string, body: object) => {
    const r = await t.req('POST', url, { token, body });
    expect(r.status).toBe(201);
    return r.body;
  };
  const get = (token: string | undefined, seasonId: string) => t.req('GET', `/seasons/${seasonId}/certificates-due`, { token });
  const readsOf = (seasonId: string) => t.orm.em.fork().find(AuditLog, { action: 'certificate_read' as never, entityId: seasonId }, { filters: false });

  async function accept(email: string) {
    const u = await t.newUser(email);
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
    expect(acc.status).toBe(200);
    return { token: acc.body.accessToken as string, userId: u.user.id as string };
  }

  /**
   * A club with T1 and T2 (active seasons). Staff of T1 with accounts: a coach, an assistant (has the certificates
   * permission) and a trainer (does not); a coach of T2; a player of T1 with an account. Players without account, each
   * with the only certificate that matters: anna +20, bea -5, carl +200, dora none, eva +10 but disabled, fio +10 but
   * left the team, gina (T2) +15.
   */
  async function club(tag: string) {
    const s = await t.newUser(`${tag}@test.it`);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${tag}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    const admin = c.body.accessToken as string;
    const act = await post(admin, '/activities', { name: 'Sport', sportProfile: 'football' });
    const team = async (name: string) => {
      const sq = await post(admin, `/activities/${act.id}/teams`, { name });
      const st = await post(admin, `/teams/${sq.id}/seasons`, { name: 'Now', startDate: day(-60), endDate: day(400) });
      return { teamId: sq.id as string, seasonId: st.id as string };
    };
    const t1 = await team('T1');
    const t2 = await team('T2');
    const member = async (seasonId: string, name: string, type: 'player' | 'staff', opts: { account?: boolean; staffRole?: string; expiry?: number } = {}) => {
      const email = `${name}-${tag}@test.it`;
      const p = await post(admin, '/people', { name, surname: 'Rossi', birthDate: '1990-01-01', email });
      const enrollment = await post(admin, `/seasons/${seasonId}/enrollments`, { personId: p.id, type, ...(type === 'staff' ? { staffRole: opts.staffRole ?? 'coach' } : {}) });
      if (opts.expiry !== undefined) {
        await post(admin, `/people/${p.id}/certificates`, { type: 'competitive', issueDate: day(Math.min(opts.expiry, 0) - 300), expiryDate: day(opts.expiry) });
      }
      let account = { token: '', userId: '' };
      if (opts.account !== false) {
        await post(admin, '/invitations', { email, role: type, personId: p.id });
        account = await accept(email);
      }
      return { personId: p.id as string, enrollmentId: enrollment.id as string, ...account };
    };
    const coach = await member(t1.seasonId, 'coach', 'staff');
    const assistant = await member(t1.seasonId, 'assistant', 'staff', { staffRole: 'assistant_coach' });
    const trainer = await member(t1.seasonId, 'trainer', 'staff', { staffRole: 'trainer' });
    const coach2 = await member(t2.seasonId, 'coach2', 'staff');
    const mate = await member(t1.seasonId, 'mate', 'player', { expiry: 200 });
    const no = { account: false } as const;
    const anna = await member(t1.seasonId, 'anna', 'player', { ...no, expiry: 20 });
    const bea = await member(t1.seasonId, 'bea', 'player', { ...no, expiry: -5 });
    await member(t1.seasonId, 'carl', 'player', { ...no, expiry: 200 });
    await member(t1.seasonId, 'dora', 'player', no);
    const eva = await member(t1.seasonId, 'eva', 'player', { ...no, expiry: 10 });
    const fio = await member(t1.seasonId, 'fio', 'player', { ...no, expiry: 10 });
    await member(t2.seasonId, 'gina', 'player', { ...no, expiry: 15 });
    expect((await t.req('POST', `/people/${eva.personId}/disable`, { token: admin })).status).toBe(200);
    expect((await t.req('POST', `/enrollments/${fio.enrollmentId}/close`, { token: admin })).status).toBe(200);
    for (const x of [t1, t2]) expect((await t.req('POST', `/seasons/${x.seasonId}/active`, { token: admin })).status).toBe(200);
    return { admin, t1, t2, coach, assistant, trainer, coach2, mate, anna, bea };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const names = (rows: any[]) => rows.map((r) => r.name);

  it('lists the players of the team whose certificate expires within 30 days or has expired, most urgent first, with date and days left', async () => {
    const s = await club('cd1');
    const r = await get(s.coach.token, s.t1.seasonId);
    expect(r.status).toBe(200);
    expect(names(r.body)).toEqual(['bea', 'anna']);
    expect(r.body[0]).toMatchObject({ personId: s.bea.personId, surname: 'Rossi', status: 'expired', expiry: day(-5), daysLeft: -5 });
    expect(r.body[1]).toMatchObject({ personId: s.anna.personId, status: 'expiring', expiry: day(20), daysLeft: 20 });
  });

  it('leaves out valid certificates, players with none, disabled people, those who left the team, staff and other teams', async () => {
    const s = await club('cd2');
    expect(names((await get(s.admin, s.t1.seasonId)).body)).toEqual(['bea', 'anna']);
    expect(names((await get(s.admin, s.t2.seasonId)).body)).toEqual(['gina']);
  });

  it('exposes only status and dates', async () => {
    const s = await club('cd3');
    const r = await get(s.coach.token, s.t1.seasonId);
    expect(Object.keys(r.body[0]).sort()).toEqual(['daysLeft', 'expiry', 'name', 'personId', 'status', 'surname']);
  });

  it('a later certificate replaces an expiring one: the furthest expiry counts', async () => {
    const s = await club('cd4');
    await post(s.admin, `/people/${s.anna.personId}/certificates`, { type: 'competitive', issueDate: day(-1), expiryDate: day(300) });
    expect(names((await get(s.coach.token, s.t1.seasonId)).body)).toEqual(['bea']);
  });

  it('who holds the certificates permission in the team reads: coach, assistant, admin', async () => {
    const s = await club('cd5');
    for (const token of [s.coach.token, s.assistant.token, s.admin]) expect(names((await get(token, s.t1.seasonId)).body)).toEqual(['bea', 'anna']);
  });

  it('the permission follows the diff, in both directions', async () => {
    const s = await club('cd6');
    const put = (userId: string, diff: object) => t.req('PUT', `/permissions/${userId}`, { token: s.admin, body: { diff } });
    expect((await put(s.trainer.userId, { 'certificates.status': true })).status).toBe(200);
    expect((await get(s.trainer.token, s.t1.seasonId)).status).toBe(200);
    expect((await put(s.assistant.userId, { 'certificates.status': false })).status).toBe(200);
    expect((await get(s.assistant.token, s.t1.seasonId)).status).toBe(403);
  });

  it('without the permission: a trainer, a player, staff of another team are all denied; another club does not see the season', async () => {
    const s = await club('cd7');
    const other = await club('cd7b');
    for (const token of [s.trainer.token, s.mate.token, s.coach2.token]) {
      const r = await get(token, s.t1.seasonId);
      expect([r.status, r.body.code]).toEqual([403, 'PERMISSION_DENIED']);
    }
    const r = await get(other.admin, s.t1.seasonId);
    expect([r.status, r.body.code]).toEqual([404, 'SEASON_NOT_FOUND']);
    expect((await get(undefined, s.t1.seasonId)).status).toBe(401);
  });

  it('every read of the list is audited against the season, with no content; a denied one is not', async () => {
    const s = await club('cd8');
    await get(s.coach.token, s.t1.seasonId);
    await get(s.admin, s.t1.seasonId);
    await get(s.trainer.token, s.t1.seasonId);
    const rows = await readsOf(s.t1.seasonId);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ entity: 'Season', meta: null });
      expect(JSON.stringify(row)).not.toContain(day(20));
    }
  });

  it('events-access tells the calendar who may open the list', async () => {
    const s = await club('cd9');
    const flag = async (token: string) => (await t.req('GET', `/seasons/${s.t1.seasonId}/events-access`, { token })).body.canSeeCertificates;
    expect(await Promise.all([s.admin, s.coach.token, s.assistant.token].map(flag))).toEqual([true, true, true]);
    expect(await Promise.all([s.trainer.token, s.mate.token, s.coach2.token].map(flag))).toEqual([false, false, false]);
  });
});
