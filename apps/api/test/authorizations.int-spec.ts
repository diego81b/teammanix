import { RequestContext } from '@mikro-orm/core';
import { MembershipsService } from '../src/auth/memberships.service';
import { EventType } from '../src/entities/enums';
import { Event } from '../src/entities/event.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { AuthorizationsService, type Goal } from '../src/permissions/authorizations.service';
import type { PolicyKey } from '../src/permissions/policy';
import { Environment, startEnvironment } from './helpers';

describe('authorizations: policies applied by scope', () => {
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

  const api = () => t.app.get(AuthorizationsService);

  async function admin(email: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    return { token: c.body.accessToken as string, clubId: c.body.activeClub.id as string, userId: s.user.id as string };
  }

  const post = async (token: string, url: string, body: object) => {
    const r = await t.req('POST', url, { token, body });
    expect(r.status).toBe(201);
    return r.body;
  };

  /**
   * Club with activity A (teams S1 and S2, one season each) and activity B (team SB, one season).
   * Seasons are drafts: for staff every non-closed season counts.
   */
  async function club(email: string) {
    const a = await admin(email);
    const actA = await post(a.token, '/activities', { name: 'Calcio A', sportProfile: 'football' });
    const actB = await post(a.token, '/activities', { name: 'Calcio B', sportProfile: 'football' });
    const period = { startDate: '2026-09-01', endDate: '2027-06-30' };
    const sq = async (activityId: string, name: string) => {
      const s = await post(a.token, `/activities/${activityId}/teams`, { name });
      const st = await post(a.token, `/teams/${s.id}/seasons`, { name: '2026/27', ...period });
      return { teamId: s.id as string, seasonId: st.id as string };
    };
    return { ...a, activityA: actA.id as string, activityB: actB.id as string, s1: await sq(actA.id, 'S1'), s2: await sq(actA.id, 'S2'), sb: await sq(actB.id, 'SB') };
  }

  /** Person with an account: record, enrollment, accepted invitation. Returns user and person. */
  async function withAccount(a: { token: string }, seasonId: string, email: string, enrollment: object, invitationRole: 'staff' | 'player') {
    const p = await post(a.token, '/people', { name: 'Carlo', surname: 'Neri', birthDate: '1985-02-03', email });
    const i = await post(a.token, `/seasons/${seasonId}/enrollments`, { personId: p.id, ...enrollment });
    await post(a.token, '/invitations', { email, role: invitationRole, personId: p.id });
    const u = await t.newUser(email);
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
    expect(acc.status).toBe(200);
    return { userId: u.user.id as string, personId: p.id as string, enrollmentId: i.id as string };
  }
  const coach = (a: { token: string }, seasonId: string, email: string, staffRole = 'coach') =>
    withAccount(a, seasonId, email, { type: 'staff', staffRole }, 'staff');
  const managerOf = async (a: { token: string }, email: string, extra: object) => {
    await post(a.token, '/invitations', { email, role: 'manager', ...extra });
    const u = await t.newUser(email);
    expect((await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } })).status).toBe(200);
    return { userId: u.user.id as string };
  };

  /** Outside a request a MikroORM context is needed, as the Nest middleware creates it. */
  const inContext = <T>(f: () => Promise<T>): Promise<T> => RequestContext.create(t.orm.em, f);
  const ctx = async (userId: string, clubId: string) => {
    const c = await t.app.get(MembershipsService).context(userId, clubId);
    if (!c) throw new Error('nessun contesto');
    return c;
  };
  /** Outcome of the check: 'ok' or `status:code`. */
  const outcome = async (userId: string, clubId: string, policy: PolicyKey, on: Goal) => {
    try {
      await inContext(async () => api().request(await ctx(userId, clubId), policy, on));
      return 'ok';
    } catch (e) {
      const r = (e as { getStatus?: () => number; getResponse?: () => { code?: string } });
      return `${r.getStatus?.()}:${r.getResponse?.().code}`;
    }
  };
  const DENIED = '403:PERMISSION_DENIED';

  it('admin: every policy, at every level', async () => {
    const s = await club('au-1@test.it');
    for (const on of [{ club: true }, { activityId: s.activityB }, { teamId: s.sb.teamId }, { seasonId: s.s2.seasonId }] as Goal[]) {
      expect(await outcome(s.userId, s.clubId, 'events.manage', on)).toBe('ok');
      expect(await outcome(s.userId, s.clubId, 'people.disable', on)).toBe('ok');
    }
  });

  describe('coach', () => {
    it('acts only on their own team: the other team, the other activity and the club are rejected', async () => {
      const s = await club('au-2@test.it');
      const all = await coach(s, s.s1.seasonId, 'au-2all@test.it');
      expect(await outcome(all.userId, s.clubId, 'events.manage', { seasonId: s.s1.seasonId })).toBe('ok');
      expect(await outcome(all.userId, s.clubId, 'events.manage', { teamId: s.s1.teamId })).toBe('ok');
      expect(await outcome(all.userId, s.clubId, 'events.manage', { seasonId: s.s2.seasonId })).toBe(DENIED);
      expect(await outcome(all.userId, s.clubId, 'events.manage', { teamId: s.sb.teamId })).toBe(DENIED);
      expect(await outcome(all.userId, s.clubId, 'events.manage', { activityId: s.activityA })).toBe(DENIED);
      expect(await outcome(all.userId, s.clubId, 'events.manage', { club: true })).toBe(DENIED);
    });

    it('the coach of another team does not get into the first', async () => {
      const s = await club('au-3@test.it');
      const other = await coach(s, s.s2.seasonId, 'au-3all@test.it');
      expect(await outcome(other.userId, s.clubId, 'events.manage', { seasonId: s.s1.seasonId })).toBe(DENIED);
      expect(await outcome(other.userId, s.clubId, 'events.manage', { seasonId: s.s2.seasonId })).toBe('ok');
    });

    it('policies outside the template stay denied: people.disable and certificates.file', async () => {
      const s = await club('au-4@test.it');
      const all = await coach(s, s.s1.seasonId, 'au-4all@test.it');
      expect(await outcome(all.userId, s.clubId, 'people.disable', { teamId: s.s1.teamId })).toBe(DENIED);
      expect(await outcome(all.userId, s.clubId, 'certificates.file', { teamId: s.s1.teamId })).toBe(DENIED);
    });

    it('a policy revoked by the diff is denied even in their own team', async () => {
      const s = await club('au-5@test.it');
      const all = await coach(s, s.s1.seasonId, 'au-5all@test.it');
      const r = await t.req('PUT', `/permissions/${all.userId}`, { token: s.token, body: { diff: { 'events.manage': false } } });
      expect(r.status).toBe(200);
      expect(await outcome(all.userId, s.clubId, 'events.manage', { seasonId: s.s1.seasonId })).toBe(DENIED);
      expect(await outcome(all.userId, s.clubId, 'callups.manage', { seasonId: s.s1.seasonId })).toBe('ok');
    });

    it('with a closed season or a closed enrollment the permissions end', async () => {
      const s = await club('au-6@test.it');
      const all = await coach(s, s.s1.seasonId, 'au-6all@test.it');
      const other = await coach(s, s.s1.seasonId, 'au-6bis@test.it');
      expect((await t.req('POST', `/enrollments/${other.enrollmentId}/close`, { token: s.token })).status).toBe(200);
      expect(await outcome(other.userId, s.clubId, 'events.manage', { seasonId: s.s1.seasonId })).toBe(DENIED);
      expect((await t.req('POST', `/seasons/${s.s1.seasonId}/active`, { token: s.token })).status).toBe(200);
      expect((await t.req('POST', `/seasons/${s.s1.seasonId}/close`, { token: s.token })).status).toBe(200);
      expect(await outcome(all.userId, s.clubId, 'events.manage', { seasonId: s.s1.seasonId })).toBe(DENIED);
    });
  });

  describe('other staff roles', () => {
    it('assistant coach: callups and attendances yes, events no', async () => {
      const s = await club('au-7@test.it');
      const vice = await coach(s, s.s1.seasonId, 'au-7v@test.it', 'assistant_coach');
      expect(await outcome(vice.userId, s.clubId, 'callups.manage', { seasonId: s.s1.seasonId })).toBe('ok');
      expect(await outcome(vice.userId, s.clubId, 'events.manage', { seasonId: s.s1.seasonId })).toBe(DENIED);
      expect(await outcome(vice.userId, s.clubId, 'callups.manage', { seasonId: s.s2.seasonId })).toBe(DENIED);
    });

    it('escort: no policy', async () => {
      const s = await club('au-8@test.it');
      const acc = await coach(s, s.s1.seasonId, 'au-8a@test.it', 'escort');
      expect(await outcome(acc.userId, s.clubId, 'attendances.record', { seasonId: s.s1.seasonId })).toBe(DENIED);
    });
  });

  describe('manager', () => {
    it('without granted policies can do nothing, not even within their scope', async () => {
      const s = await club('au-9@test.it');
      const d = await managerOf(s, 'au-9d@test.it', { scope: 'activity', activityId: s.activityA });
      expect(await outcome(d.userId, s.clubId, 'events.manage', { seasonId: s.s1.seasonId })).toBe(DENIED);
      expect(await outcome(d.userId, s.clubId, 'people.manage', { activityId: s.activityA })).toBe(DENIED);
    });

    it('with the granted policy it applies only within the role scope', async () => {
      const s = await club('au-10@test.it');
      const d = await managerOf(s, 'au-10d@test.it', { scope: 'activity', activityId: s.activityA });
      expect((await t.req('PUT', `/permissions/${d.userId}`, { token: s.token, body: { diff: { 'events.manage': true } } })).status).toBe(200);
      expect(await outcome(d.userId, s.clubId, 'events.manage', { seasonId: s.s1.seasonId })).toBe('ok');
      expect(await outcome(d.userId, s.clubId, 'events.manage', { seasonId: s.s2.seasonId })).toBe('ok');
      expect(await outcome(d.userId, s.clubId, 'events.manage', { activityId: s.activityA })).toBe('ok');
      expect(await outcome(d.userId, s.clubId, 'events.manage', { seasonId: s.sb.seasonId })).toBe(DENIED);
      expect(await outcome(d.userId, s.clubId, 'events.manage', { club: true })).toBe(DENIED);
      expect(await outcome(d.userId, s.clubId, 'attendances.record', { seasonId: s.s1.seasonId })).toBe(DENIED);
    });

    it('team manager: only that team', async () => {
      const s = await club('au-11@test.it');
      const d = await managerOf(s, 'au-11d@test.it', { scope: 'team', teamId: s.s1.teamId });
      await t.req('PUT', `/permissions/${d.userId}`, { token: s.token, body: { diff: { 'events.manage': true } } });
      expect(await outcome(d.userId, s.clubId, 'events.manage', { seasonId: s.s1.seasonId })).toBe('ok');
      expect(await outcome(d.userId, s.clubId, 'events.manage', { seasonId: s.s2.seasonId })).toBe(DENIED);
      expect(await outcome(d.userId, s.clubId, 'events.manage', { activityId: s.activityA })).toBe(DENIED);
    });

    it('club manager with the policy: anywhere in the club', async () => {
      const s = await club('au-12@test.it');
      const d = await managerOf(s, 'au-12d@test.it', {});
      await t.req('PUT', `/permissions/${d.userId}`, { token: s.token, body: { diff: { 'events.manage': true } } });
      for (const on of [{ club: true }, { activityId: s.activityB }, { seasonId: s.sb.seasonId }] as Goal[]) {
        expect(await outcome(d.userId, s.clubId, 'events.manage', on)).toBe('ok');
      }
    });
  });

  describe('player', () => {
    it('has no management policy, not even in their own team and not even with a diff', async () => {
      const s = await club('au-13@test.it');
      const g = await withAccount(s, s.s1.seasonId, 'au-13g@test.it', { type: 'player' }, 'player');
      await t.req('PUT', `/permissions/${g.userId}`, { token: s.token, body: { diff: { 'events.manage': true } } });
      expect(await outcome(g.userId, s.clubId, 'events.manage', { seasonId: s.s1.seasonId })).toBe(DENIED);
      expect(await outcome(g.userId, s.clubId, 'attendances.record', { teamId: s.s1.teamId })).toBe(DENIED);
    });
  });

  describe('isolation between clubs and nonexistent targets', () => {
    it('a target of another club is 404, never 403', async () => {
      const s1 = await club('au-14@test.it');
      const s2 = await club('au-14b@test.it');
      const other = { userId: s2.userId, clubId: s2.clubId };
      expect(await outcome(other.userId, other.clubId, 'events.manage', { seasonId: s1.s1.seasonId })).toBe('404:SEASON_NOT_FOUND');
      expect(await outcome(other.userId, other.clubId, 'events.manage', { teamId: s1.s1.teamId })).toBe('404:TEAM_NOT_FOUND');
      expect(await outcome(other.userId, other.clubId, 'events.manage', { activityId: s1.activityA })).toBe('404:ACTIVITY_NOT_FOUND');
    });

    it('an enrollment resolves to its team', async () => {
      const s = await club('au-15@test.it');
      const all = await coach(s, s.s1.seasonId, 'au-15all@test.it');
      const other = await coach(s, s.s2.seasonId, 'au-15bis@test.it');
      expect(await outcome(all.userId, s.clubId, 'attendances.record', { enrollmentId: all.enrollmentId })).toBe('ok');
      expect(await outcome(all.userId, s.clubId, 'attendances.record', { enrollmentId: other.enrollmentId })).toBe(DENIED);
      const r = await outcome(all.userId, s.clubId, 'attendances.record', { enrollmentId: '00000000-0000-4000-8000-000000000000' });
      expect(r).toBe('404:ENROLLMENT_NOT_FOUND');
    });

    it('an event resolves to its team, and one of another club is 404', async () => {
      const s = await club('au-16@test.it');
      const other = await club('au-16b@test.it');
      const all = await coach(s, s.s1.seasonId, 'au-16all@test.it');
      const em = t.orm.em.fork();
      const newEvent = (c: { clubId: string }, seasonId: string) =>
        em.create(Event, {
          club: c.clubId,
          season: seasonId,
          type: EventType.TRAINING,
          start: new Date('2026-10-06T16:00:00Z'),
          end: new Date('2026-10-06T17:00:00Z'),
        } as never);
      const mine = newEvent(s, s.s1.seasonId);
      const ofOtherTeam = newEvent(s, s.s2.seasonId);
      const ofOtherClub = newEvent(other, other.s1.seasonId);
      await em.flush();
      expect(await outcome(all.userId, s.clubId, 'events.manage', { eventId: mine.id })).toBe('ok');
      expect(await outcome(all.userId, s.clubId, 'events.manage', { eventId: ofOtherTeam.id })).toBe(DENIED);
      expect(await outcome(all.userId, s.clubId, 'events.manage', { eventId: ofOtherClub.id })).toBe('404:EVENT_NOT_FOUND');
    });
  });
});
