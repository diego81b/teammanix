import { Enrollment } from '../src/entities/enrollment.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('injured state set by staff (#27)', () => {
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
  const setStatus = (token: string, id: string, status: unknown) => t.req('PUT', `/enrollments/${id}/status`, { token, body: { status } });
  const statusOf = async (id: string) => (await t.orm.em.fork().findOneOrFail(Enrollment, id, { filters: false })).status;
  async function accept(email: string) {
    const u = await t.newUser(email);
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
    expect(acc.status).toBe(200);
    return acc.body.accessToken as string;
  }

  /** Club with T1 and T2: coach and assistant of T1, coach of T2, a player in both teams and a player only in T1. */
  async function club(email: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    const admin = c.body.accessToken as string;
    const act = await post(admin, '/activities', { name: 'Sport', sportProfile: 'football' });
    const team = async (name: string) => {
      const sq = await post(admin, `/activities/${act.id}/teams`, { name });
      const st = await post(admin, `/teams/${sq.id}/seasons`, { name: 'Now', startDate: day(-60), endDate: day(400) });
      return st.id as string;
    };
    const s1 = await team('T1');
    const s2 = await team('T2');
    const person = (tag: string) => post(admin, '/people', { name: tag, surname: 'Rossi', birthDate: '1990-01-01', email: `${tag}-${email}` });
    const enroll = (seasonId: string, personId: string, type: 'player' | 'staff', staffRole?: string) =>
      post(admin, `/seasons/${seasonId}/enrollments`, { personId, type, ...(staffRole ? { staffRole } : {}) });
    const staff = async (seasonId: string, tag: string, role: string) => {
      const p = await person(tag);
      await enroll(seasonId, p.id, 'staff', role);
      await post(admin, '/invitations', { email: `${tag}-${email}`, role: 'staff', personId: p.id });
      return accept(`${tag}-${email}`);
    };
    const coach1 = await staff(s1, 'c1', 'coach');
    const assistant = await staff(s1, 'as', 'assistant_coach');
    const coach2 = await staff(s2, 'c2', 'coach');
    const both = await person('both');
    const inT1 = await enroll(s1, both.id, 'player');
    const inT2 = await enroll(s2, both.id, 'player');
    const only = await person('only');
    const onlyT1 = await enroll(s1, only.id, 'player');
    for (const id of [s1, s2]) expect((await t.req('POST', `/seasons/${id}/active`, { token: admin })).status).toBe(200);
    return { admin, coach1, assistant, coach2, inT1: inT1.id as string, inT2: inT2.id as string, onlyT1: onlyT1.id as string };
  }

  it('the coach of one team marks the player injured in every team, and the coach of the other clears it', async () => {
    const c = await club('st-1@test.it');
    const r = await setStatus(c.coach1, c.inT1, 'injured');
    expect([r.status, r.body.status]).toEqual([200, 'injured']);
    expect(await statusOf(c.inT2)).toBe('injured');
    expect((await setStatus(c.coach2, c.inT2, 'available')).status).toBe(200);
    expect(await statusOf(c.inT1)).toBe('available');
  });

  it('the coach of a team can set the state of a player of their own team only', async () => {
    const c = await club('st-2@test.it');
    const r = await setStatus(c.coach2, c.onlyT1, 'injured');
    expect([r.status, r.body.code]).toEqual([403, 'PERMISSION_DENIED']);
    expect(await statusOf(c.onlyT1)).toBe('available');
  });

  it('staff without people.manage is refused', async () => {
    const c = await club('st-3@test.it');
    const r = await setStatus(c.assistant, c.inT1, 'injured');
    expect([r.status, r.body.code]).toEqual([403, 'PERMISSION_DENIED']);
    expect(await statusOf(c.inT2)).toBe('available');
  });

  it('the admin can set it too', async () => {
    const c = await club('st-4@test.it');
    expect((await setStatus(c.admin, c.inT1, 'injured')).status).toBe(200);
    expect(await statusOf(c.inT2)).toBe('injured');
  });

  it('refuses an invalid status, a closed enrollment and an enrollment of another club', async () => {
    const c = await club('st-5@test.it');
    const other = await club('st-5b@test.it');
    const invalid = await setStatus(c.coach1, c.inT1, 'asleep');
    expect([invalid.status, invalid.body.code]).toEqual([400, 'INVALID_DATA']);
    await t.req('POST', `/enrollments/${c.inT1}/close`, { token: c.admin });
    const closed = await setStatus(c.coach1, c.inT1, 'injured');
    expect([closed.status, closed.body.code]).toEqual([409, 'ENROLLMENT_CLOSED']);
    const foreign = await setStatus(other.coach1, c.inT2, 'injured');
    expect(foreign.status).toBe(404);
  });

  it('the route changes the status only: it takes no other field', async () => {
    const c = await club('st-6@test.it');
    const r = await t.req('PUT', `/enrollments/${c.inT1}/status`, { token: c.coach1, body: { status: 'injured', jerseyNumber: 99 } });
    expect(r.status).toBe(400);
  });
});
