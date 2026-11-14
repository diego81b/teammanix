import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment, createTeams, roleId } from './helpers';

const DAY = '2026-10-06';
const slot = (day = DAY, from = '16:00', to = '17:30') => ({ start: `${day}T${from}:00Z`, end: `${day}T${to}:00Z` });

describe('events: plan trainings and matches for the active season of a team', () => {
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

  const send = async (token: string, method: string, url: string, body?: object) => t.req(method, url, { token, body });
  const post = async (token: string, url: string, body: object) => {
    const r = await t.req('POST', url, { token, body });
    expect(r.status).toBe(201);
    return r.body;
  };

  async function accept(email: string) {
    const u = await t.newUser(email);
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
    expect(acc.status).toBe(200);
    return { token: acc.body.accessToken as string, userId: u.user.id as string };
  }

  /** Club without sections, teams T1 and T2 (active seasons 2026-09-01..2027-06-30), a coach of T1, a coach of T2 and a player of T1. */
  async function club(email: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    const admin = c.body.accessToken as string;
    const struct = await createTeams(t.req, admin, { sportProfile: 'football' });
    const team = async (name: string) => {
      const sq = await struct.team(name);
      const st = await post(admin, `/teams/${sq.id}/seasons`, { name: '2026/27', startDate: '2026-09-01', endDate: '2027-06-30' });
      return { teamId: sq.id as string, seasonId: st.id as string };
    };
    const t1 = await team('T1');
    const t2 = await team('T2');
    const staff = async (seasonId: string, addr: string, type: 'staff' | 'player') => {
      const p = await post(admin, '/people', { name: 'Carlo', surname: 'Neri', birthDate: '1985-02-03', email: addr });
      await post(admin, `/seasons/${seasonId}/enrollments`, { personId: p.id, type, ...(type === 'staff' ? { staffRoleId: await roleId(t.req, admin, 'coach') } : {}) });
      await post(admin, '/invitations', { email: addr, role: type, personId: p.id });
      return accept(addr);
    };
    const coach1 = await staff(t1.seasonId, `c1-${email}`, 'staff');
    const coach2 = await staff(t2.seasonId, `c2-${email}`, 'staff');
    const player = await staff(t1.seasonId, `p1-${email}`, 'player');
    for (const x of [t1, t2]) expect((await t.req('POST', `/seasons/${x.seasonId}/active`, { token: admin })).status).toBe(200);
    return { admin, clubId: c.body.activeClub.id as string, struct, t1, t2, coach1, coach2, player };
  }

  const match = (extra: object = {}) => ({ type: 'match', ...slot(), opponent: 'ASD Virtus', homeAway: 'home', ...extra });
  const training = (extra: object = {}) => ({ type: 'training', ...slot(), ...extra });

  describe('create', () => {
    it('the coach plans a match with venue and opponent and it appears in the team calendar', async () => {
      const s = await club('ev-1@test.it');
      const venue = await post(s.admin, '/venues', { name: 'Stadio comunale', address: 'Via Roma 1' });
      const r = await send(s.coach1.token, 'POST', `/teams/${s.t1.teamId}/events`, match({ venueId: venue.id, competition: 'Coppa' }));
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({
        type: 'match',
        status: 'scheduled',
        seasonId: s.t1.seasonId,
        teamId: s.t1.teamId,
        homeAway: 'home',
        competition: 'Coppa',
        venue: { id: venue.id, name: 'Stadio comunale' },
        opponent: { name: 'ASD Virtus' },
        start: '2026-10-06T16:00:00.000Z',
      });
      const list = await send(s.coach1.token, 'GET', `/seasons/${s.t1.seasonId}/events`);
      expect(list.status).toBe(200);
      expect(list.body.map((e: { id: string }) => e.id)).toEqual([r.body.id]);
    });

    it('a training needs neither venue nor opponent', async () => {
      const s = await club('ev-2@test.it');
      const r = await send(s.coach1.token, 'POST', `/teams/${s.t1.teamId}/events`, training({ title: 'Warm up', note: 'Bring bibs' }));
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ type: 'training', title: 'Warm up', note: 'Bring bibs', venue: null, opponent: null, homeAway: null });
    });

    it('a date outside the season dates is refused', async () => {
      const s = await club('ev-3@test.it');
      for (const day of ['2026-08-31', '2027-07-01']) {
        const r = await send(s.coach1.token, 'POST', `/teams/${s.t1.teamId}/events`, training(slot(day)));
        expect([r.status, r.body.code]).toEqual([400, 'EVENT_OUTSIDE_SEASON']);
      }
      const first = await send(s.coach1.token, 'POST', `/teams/${s.t1.teamId}/events`, training({ start: '2026-08-31T22:30:00Z', end: '2026-08-31T23:30:00Z' }));
      expect(first.status).toBe(201);
    });

    it('a team without an active season refuses events, a closed one too', async () => {
      const s = await club('ev-4@test.it');
      const sq = await s.struct.team('T3');
      await post(s.admin, `/teams/${sq.id}/seasons`, { name: '2026/27', startDate: '2026-09-01', endDate: '2027-06-30' });
      const draft = await send(s.admin, 'POST', `/teams/${sq.id}/events`, training());
      expect([draft.status, draft.body.code]).toEqual([409, 'NO_ACTIVE_SEASON']);

      expect((await t.req('POST', `/seasons/${s.t1.seasonId}/close`, { token: s.admin })).status).toBe(200);
      const closed = await send(s.admin, 'POST', `/teams/${s.t1.teamId}/events`, training());
      expect([closed.status, closed.body.code]).toEqual([409, 'NO_ACTIVE_SEASON']);
      // The coach's permissions end with the season (see authorizations), so they are refused earlier.
      expect((await send(s.coach1.token, 'POST', `/teams/${s.t1.teamId}/events`, training())).body.code).toBe('PERMISSION_DENIED');
    });

    it('validations: period, match fields, payload', async () => {
      const s = await club('ev-5@test.it');
      const url = `/teams/${s.t1.teamId}/events`;
      const code = async (body: object) => {
        const r = await send(s.coach1.token, 'POST', url, body);
        return [r.status, r.body.code];
      };
      expect(await code(training({ end: '2026-10-06T15:00:00Z' }))).toEqual([400, 'INVALID_PERIOD_EVENT']);
      expect(await code(training({ start: '2026-02-30T10:00:00Z' }))).toEqual([400, 'INVALID_DATA']);
      expect(await code(training({ start: '2026-10-06T16:00:00' }))).toEqual([400, 'INVALID_DATA']);
      expect(await code(match({ opponent: undefined }))).toEqual([400, 'MATCH_FIELDS_REQUIRED']);
      expect(await code(match({ homeAway: undefined }))).toEqual([400, 'MATCH_FIELDS_REQUIRED']);
      expect(await code(training({ homeAway: 'away' }))).toEqual([400, 'MATCH_FIELDS_NOT_ALLOWED']);
      expect(await code(training({ opponent: 'Virtus' }))).toEqual([400, 'MATCH_FIELDS_NOT_ALLOWED']);
      expect(await code(training({ competition: 'Cup' }))).toEqual([400, 'MATCH_FIELDS_NOT_ALLOWED']);
      expect(await code({ ...slot() })).toEqual([400, 'INVALID_DATA']);
      expect(await code(training({ type: 'party' }))).toEqual([400, 'INVALID_DATA']);
      expect(await code(match({ homeAway: 'moon' }))).toEqual([400, 'INVALID_DATA']);
    });

    it('a player and the coach of another team are refused, even with an invalid event', async () => {
      const s = await club('ev-6@test.it');
      const url = `/teams/${s.t1.teamId}/events`;
      for (const who of [s.player, s.coach2]) {
        expect((await send(who.token, 'POST', url, training())).body.code).toBe('PERMISSION_DENIED');
        expect((await send(who.token, 'POST', url, training({ end: '2026-10-06T15:00:00Z' }))).body.code).toBe('PERMISSION_DENIED');
      }
    });

    it('a team of another club is 404', async () => {
      const s = await club('ev-6b@test.it');
      const other = await club('ev-6c@test.it');
      const r = await send(s.admin, 'POST', `/teams/${other.t1.teamId}/events`, training());
      expect([r.status, r.body.code]).toEqual([404, 'TEAM_NOT_FOUND']);
    });

    it('a venue of another club is not found', async () => {
      const s = await club('ev-7@test.it');
      const other = await club('ev-7b@test.it');
      const venue = await post(other.admin, '/venues', { name: 'Elsewhere' });
      const r = await send(s.coach1.token, 'POST', `/teams/${s.t1.teamId}/events`, training({ venueId: venue.id }));
      expect([r.status, r.body.code]).toEqual([404, 'VENUE_NOT_FOUND']);
    });
  });

  describe('opponents', () => {
    it('an opponent typed once is reused, whatever the case, spaces and accents', async () => {
      const s = await club('ev-8@test.it');
      const url = `/teams/${s.t1.teamId}/events`;
      const a = await send(s.coach1.token, 'POST', url, match({ opponent: 'ASD Virtus' }));
      const b = await send(s.coach1.token, 'POST', url, match({ ...slot('2026-10-13'), opponent: '  asd   VIRTUS ' }));
      expect(b.body.opponent.id).toBe(a.body.opponent.id);
      expect(b.body.opponent.name).toBe('ASD Virtus');
      await send(s.coach1.token, 'POST', url, match({ ...slot('2026-10-20'), opponent: 'Città Nord' }));
      const c = await send(s.coach1.token, 'POST', url, match({ ...slot('2026-10-27'), opponent: 'citta nord' }));
      const list = await send(s.coach1.token, 'GET', `/teams/${s.t1.teamId}/opponents`);
      expect(list.body.map((o: { name: string }) => o.name)).toEqual(['ASD Virtus', 'Città Nord']);
      expect(c.body.opponent.name).toBe('Città Nord');
    });

    it('opponents belong to the team: another team of the same section does not see them, and has its own with the same name', async () => {
      const s = await club('ev-9@test.it');
      const first = await send(s.coach1.token, 'POST', `/teams/${s.t1.teamId}/events`, match());
      const own = await send(s.coach1.token, 'GET', `/teams/${s.t1.teamId}/opponents`);
      expect(own.body.map((o: { name: string }) => o.name)).toEqual(['ASD Virtus']);
      const list = await send(s.coach2.token, 'GET', `/teams/${s.t2.teamId}/opponents`);
      expect(list.status).toBe(200);
      expect(list.body).toEqual([]);

      const second = await send(s.coach2.token, 'POST', `/teams/${s.t2.teamId}/events`, match());
      expect(second.status).toBe(201);
      expect(second.body.opponent.name).toBe('ASD Virtus');
      expect(second.body.opponent.id).not.toBe(first.body.opponent.id);
    });

    it('two simultaneous events with a new opponent create it once', async () => {
      const s = await club('ev-10@test.it');
      const url = `/teams/${s.t1.teamId}/events`;
      const rs = await Promise.all(
        ['2026-11-03', '2026-11-04', '2026-11-05'].map((d) => send(s.coach1.token, 'POST', url, match({ ...slot(d), opponent: 'Racing' }))),
      );
      expect(rs.map((r) => r.status)).toEqual([201, 201, 201]);
      expect(new Set(rs.map((r) => r.body.opponent.id)).size).toBe(1);
    });

    it('the opponent list is for who manages events, not for players', async () => {
      const s = await club('ev-11@test.it');
      expect((await send(s.player.token, 'GET', `/teams/${s.t1.teamId}/opponents`)).body.code).toBe('PERMISSION_DENIED');
      expect((await send(s.coach2.token, 'GET', `/teams/${s.t1.teamId}/opponents`)).body.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('competitions', () => {
    it('the names already used in the season are suggested', async () => {
      const s = await club('ev-12@test.it');
      const url = `/teams/${s.t1.teamId}/events`;
      await send(s.coach1.token, 'POST', url, match({ competition: 'Coppa' }));
      await send(s.coach1.token, 'POST', url, match({ ...slot('2026-10-13'), competition: 'Campionato' }));
      await send(s.coach1.token, 'POST', url, match({ ...slot('2026-10-20'), competition: 'Coppa' }));
      await send(s.coach1.token, 'POST', url, match({ ...slot('2026-10-27') }));
      const r = await send(s.coach1.token, 'GET', `/seasons/${s.t1.seasonId}/competitions`);
      expect(r.body).toEqual(['Campionato', 'Coppa']);
      expect((await send(s.player.token, 'GET', `/seasons/${s.t1.seasonId}/competitions`)).body.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('edit, cancel, postpone', () => {
    const create = async (s: Awaited<ReturnType<typeof club>>, body: object = match()) => {
      const r = await send(s.coach1.token, 'POST', `/teams/${s.t1.teamId}/events`, body);
      expect(r.status).toBe(201);
      return r.body as { id: string };
    };

    it('the coach edits time, venue and note', async () => {
      const s = await club('ev-13@test.it');
      const e = await create(s);
      const venue = await post(s.admin, '/venues', { name: 'Campo B' });
      const r = await send(s.coach1.token, 'PATCH', `/events/${e.id}`, { ...slot(DAY, '18:00', '19:30'), venueId: venue.id, note: 'Late kick-off' });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ start: '2026-10-06T18:00:00.000Z', venue: { name: 'Campo B' }, note: 'Late kick-off', status: 'scheduled' });
      const cleared = await send(s.coach1.token, 'PATCH', `/events/${e.id}`, { venueId: null, note: null });
      expect(cleared.body).toMatchObject({ venue: null, note: null });
    });

    it('the merged event is validated: a start after the stored end is refused', async () => {
      const s = await club('ev-14@test.it');
      const e = await create(s);
      const r = await send(s.coach1.token, 'PATCH', `/events/${e.id}`, { start: '2026-10-06T19:00:00Z' });
      expect([r.status, r.body.code]).toEqual([400, 'INVALID_PERIOD_EVENT']);
      const out = await send(s.coach1.token, 'PATCH', `/events/${e.id}`, slot('2027-07-01'));
      expect([out.status, out.body.code]).toEqual([400, 'EVENT_OUTSIDE_SEASON']);
    });

    it('turning a match into a training drops the match fields; sending them again is refused', async () => {
      const s = await club('ev-15@test.it');
      const e = await create(s, match({ competition: 'Coppa' }));
      const r = await send(s.coach1.token, 'PATCH', `/events/${e.id}`, { type: 'training' });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ type: 'training', opponent: null, homeAway: null, competition: null });
      const again = await send(s.coach1.token, 'PATCH', `/events/${e.id}`, { homeAway: 'away' });
      expect([again.status, again.body.code]).toEqual([400, 'MATCH_FIELDS_NOT_ALLOWED']);
      const back = await send(s.coach1.token, 'PATCH', `/events/${e.id}`, { type: 'match' });
      expect(back.body.code).toBe('MATCH_FIELDS_REQUIRED');
    });

    it('cancel is final: an event cancelled cannot be edited, cancelled again or postponed', async () => {
      const s = await club('ev-16@test.it');
      const e = await create(s);
      const r = await send(s.coach1.token, 'POST', `/events/${e.id}/cancel`);
      expect([r.status, r.body.status]).toEqual([200, 'cancelled']);
      const attempts: [string, string, object | undefined][] = [['PATCH', '', { note: 'x' }], ['POST', '/cancel', undefined], ['POST', '/postpone', undefined]];
      for (const [m, u, b] of attempts) {
        const x = await send(s.coach1.token, m, `/events/${e.id}${u}`, b);
        expect(x.status).toBe(409);
        expect(x.body.code).toBe(m === 'PATCH' ? 'EVENT_NOT_EDITABLE' : 'EVENT_STATUS_INVALID');
      }
    });

    it('postponed stays distinguishable from cancelled, and new dates put it back to scheduled', async () => {
      const s = await club('ev-17@test.it');
      const e = await create(s);
      const p = await send(s.coach1.token, 'POST', `/events/${e.id}/postpone`);
      expect([p.status, p.body.status]).toEqual([200, 'postponed']);
      const note = await send(s.coach1.token, 'PATCH', `/events/${e.id}`, { note: 'New date to be set' });
      expect(note.body.status).toBe('postponed');
      const moved = await send(s.coach1.token, 'PATCH', `/events/${e.id}`, slot('2026-10-20'));
      expect([moved.status, moved.body.status]).toEqual([200, 'scheduled']);
      const twice = await send(s.coach1.token, 'POST', `/events/${e.id}/postpone`);
      expect(twice.body.status).toBe('postponed');
      const again = await send(s.coach1.token, 'POST', `/events/${e.id}/postpone`);
      expect([again.status, again.body.code]).toEqual([409, 'EVENT_STATUS_INVALID']);
      expect((await send(s.coach1.token, 'POST', `/events/${e.id}/cancel`)).body.status).toBe('cancelled');
    });

    it('a closed season is read-only', async () => {
      const s = await club('ev-18@test.it');
      const e = await create(s);
      expect((await t.req('POST', `/seasons/${s.t1.seasonId}/close`, { token: s.admin })).status).toBe(200);
      for (const r of [
        await send(s.admin, 'PATCH', `/events/${e.id}`, { note: 'x' }),
        await send(s.admin, 'POST', `/events/${e.id}/cancel`),
        await send(s.admin, 'POST', `/events/${e.id}/postpone`),
      ]) {
        expect([r.status, r.body.code]).toEqual([409, 'SEASON_CLOSED']);
      }
      const list = await send(s.player.token, 'GET', `/seasons/${s.t1.seasonId}/events`);
      expect(list.body).toHaveLength(1);
    });

    it('the coach of another team and the player cannot touch the event', async () => {
      const s = await club('ev-19@test.it');
      const e = await create(s);
      for (const who of [s.coach2, s.player]) {
        for (const r of [
          await send(who.token, 'PATCH', `/events/${e.id}`, { note: 'x' }),
          await send(who.token, 'POST', `/events/${e.id}/cancel`),
          await send(who.token, 'POST', `/events/${e.id}/postpone`),
        ]) {
          expect([r.status, r.body.code]).toEqual([403, 'PERMISSION_DENIED']);
        }
      }
    });

    it('an event of another club is 404 for everyone', async () => {
      const s = await club('ev-20@test.it');
      const other = await club('ev-20b@test.it');
      const e = await create(other);
      for (const r of [
        await send(s.admin, 'PATCH', `/events/${e.id}`, { note: 'x' }),
        await send(s.admin, 'POST', `/events/${e.id}/cancel`),
      ]) {
        expect([r.status, r.body.code]).toEqual([404, 'EVENT_NOT_FOUND']);
      }
    });
  });

  describe('read', () => {
    it('a player reads the events of their season and cannot write; a coach of another team cannot read', async () => {
      const s = await club('ev-21@test.it');
      const e = await send(s.coach1.token, 'POST', `/teams/${s.t1.teamId}/events`, training());
      const own = await send(s.player.token, 'GET', `/seasons/${s.t1.seasonId}/events`);
      expect(own.body.map((x: { id: string }) => x.id)).toEqual([e.body.id]);
      const other = await send(s.coach2.token, 'GET', `/seasons/${s.t1.seasonId}/events`);
      expect([other.status, other.body.code]).toEqual([403, 'PERMISSION_DENIED']);
    });

    it('the list is ordered by start', async () => {
      const s = await club('ev-22@test.it');
      const url = `/teams/${s.t1.teamId}/events`;
      await send(s.coach1.token, 'POST', url, training(slot('2026-10-20')));
      await send(s.coach1.token, 'POST', url, training(slot('2026-10-06')));
      await send(s.coach1.token, 'POST', url, training(slot('2026-10-13')));
      const r = await send(s.admin, 'GET', `/seasons/${s.t1.seasonId}/events`);
      expect(r.body.map((x: { start: string }) => x.start.slice(0, 10))).toEqual(['2026-10-06', '2026-10-13', '2026-10-20']);
    });

    it('a season of another club is 404', async () => {
      const s = await club('ev-23@test.it');
      const other = await club('ev-23b@test.it');
      const r = await send(s.admin, 'GET', `/seasons/${other.t1.seasonId}/events`);
      expect([r.status, r.body.code]).toEqual([404, 'SEASON_NOT_FOUND']);
    });

    it('a manager reads within their scope and writes only after a grant', async () => {
      const s = await club('ev-24@test.it');
      await post(s.admin, '/invitations', { email: 'ev-24m@test.it', role: 'manager', scope: 'team', teamId: s.t1.teamId });
      const m = await accept('ev-24m@test.it');
      expect((await send(m.token, 'GET', `/seasons/${s.t1.seasonId}/events`)).status).toBe(200);
      expect((await send(m.token, 'GET', `/seasons/${s.t2.seasonId}/events`)).body.code).toBe('PERMISSION_DENIED');
      expect((await send(m.token, 'POST', `/teams/${s.t1.teamId}/events`, training())).body.code).toBe('PERMISSION_DENIED');
      expect((await t.req('PUT', `/permissions/${m.userId}`, { token: s.admin, body: { diff: { 'events.manage': true } } })).status).toBe(200);
      expect((await send(m.token, 'POST', `/teams/${s.t1.teamId}/events`, training())).status).toBe(201);
      expect((await send(m.token, 'POST', `/teams/${s.t2.teamId}/events`, training())).body.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('access', () => {
    const access = async (token: string, seasonId: string) => (await send(token, 'GET', `/seasons/${seasonId}/events-access`)).body.canManage;

    it('tells who can plan events in the season: admin and own coach yes, player and other coach no', async () => {
      const s = await club('ev-31@test.it');
      expect(await access(s.admin, s.t1.seasonId)).toBe(true);
      expect(await access(s.coach1.token, s.t1.seasonId)).toBe(true);
      expect(await access(s.coach2.token, s.t1.seasonId)).toBe(false);
      expect(await access(s.player.token, s.t1.seasonId)).toBe(false);
      expect((await send(s.player.token, 'GET', `/seasons/${s.t1.seasonId}/events-access`)).body.teamId).toBe(s.t1.teamId);
    });

    it('a manager is false until the admin grants the policy', async () => {
      const s = await club('ev-32@test.it');
      await post(s.admin, '/invitations', { email: 'ev-32m@test.it', role: 'manager', scope: 'team', teamId: s.t1.teamId });
      const m = await accept('ev-32m@test.it');
      expect(await access(m.token, s.t1.seasonId)).toBe(false);
      await t.req('PUT', `/permissions/${m.userId}`, { token: s.admin, body: { diff: { 'events.manage': true } } });
      expect(await access(m.token, s.t1.seasonId)).toBe(true);
    });

    it('a season that is not active is false even for the admin; one of another club is 404', async () => {
      const s = await club('ev-33@test.it');
      const other = await club('ev-33b@test.it');
      await t.req('POST', `/seasons/${s.t1.seasonId}/close`, { token: s.admin });
      expect(await access(s.admin, s.t1.seasonId)).toBe(false);
      const r = await send(s.admin, 'GET', `/seasons/${other.t1.seasonId}/events-access`);
      expect([r.status, r.body.code]).toEqual([404, 'SEASON_NOT_FOUND']);
    });
  });

  describe('venues', () => {
    it('the admin creates and edits venues, the coach only lists them', async () => {
      const s = await club('ev-25@test.it');
      const v = await send(s.admin, 'POST', '/venues', { name: '  Stadio   comunale ', address: 'Via Roma 1' });
      expect([v.status, v.body.name]).toEqual([201, 'Stadio comunale']);
      expect((await send(s.coach1.token, 'POST', '/venues', { name: 'Mine' })).body.code).toBe('PERMISSION_DENIED');
      expect((await send(s.coach1.token, 'PATCH', `/venues/${v.body.id}`, { name: 'Mine' })).body.code).toBe('PERMISSION_DENIED');
      const edited = await send(s.admin, 'PATCH', `/venues/${v.body.id}`, { address: null });
      expect(edited.body).toMatchObject({ name: 'Stadio comunale', address: null });
      const list = await send(s.coach1.token, 'GET', '/venues');
      expect(list.body.map((x: { name: string }) => x.name)).toEqual(['Stadio comunale']);
      expect((await send(s.player.token, 'GET', '/venues')).status).toBe(200);
    });

    it('the same name twice is refused, whatever the case', async () => {
      const s = await club('ev-26@test.it');
      await post(s.admin, '/venues', { name: 'Campo A' });
      const r = await send(s.admin, 'POST', '/venues', { name: 'campo  a' });
      expect([r.status, r.body.code]).toEqual([409, 'VENUE_EXISTS']);
      const b = await post(s.admin, '/venues', { name: 'Campo B' });
      const rename = await send(s.admin, 'PATCH', `/venues/${b.id}`, { name: 'CAMPO A' });
      expect([rename.status, rename.body.code]).toEqual([409, 'VENUE_EXISTS']);
    });

    it('venues are per club', async () => {
      const s = await club('ev-27@test.it');
      const other = await club('ev-27b@test.it');
      await post(other.admin, '/venues', { name: 'Elsewhere' });
      const mine = await post(s.admin, '/venues', { name: 'Elsewhere' });
      expect((await send(s.admin, 'GET', '/venues')).body).toHaveLength(1);
      const r = await send(other.admin, 'PATCH', `/venues/${mine.id}`, { name: 'x' });
      expect([r.status, r.body.code]).toEqual([404, 'VENUE_NOT_FOUND']);
    });
  });
});
