import { Attendance } from '../src/entities/attendance.entity';
import { Callup } from '../src/entities/callup.entity';
import { AttendanceOutcome, CallupResponse, EnrollmentType } from '../src/entities/enums';
import { Enrollment } from '../src/entities/enrollment.entity';
import { Event } from '../src/entities/event.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment, createTeams, roleId } from './helpers';

/** Fixed season for the rules that do not depend on the clock. */
const FIXED = { startDate: '2026-09-01', endDate: '2027-06-30' };

const DAY_MS = 86_400_000;
/** Local-ish calendar day `offset` days from now. Tests keep a margin of a day around today. */
const day = (offset: number): string => new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);
const localTime = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
const localDay = (iso: string): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(iso));

type Ev = {
  id: string;
  start: string;
  end: string;
  seriesId: string | null;
  exception: boolean;
  status: string;
  title: string | null;
};

describe('event series: recurring trainings that create real events', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
    const em = t.orm.em.fork();
    em.create(SportProfile, {
      code: 'football',
      positions: ['goalkeeper'],
      modulesAvailable: ['attendances'],
    } as never);
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
    const acc = await t.req('POST', '/invitations/accept', {
      token: u.accessToken,
      body: { token: t.tokenInvitation(email) },
    });
    expect(acc.status).toBe(200);
    return { token: acc.body.accessToken as string };
  }

  /** Club with teams T1 and T2 (active season with the given dates), a coach of each and a player of T1. */
  async function club(email: string, season: { startDate: string; endDate: string } = FIXED) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', {
      token: s.accessToken,
      body: { name: `Club ${email}`, acceptDpa: true },
    });
    expect(c.status).toBe(201);
    const admin = c.body.accessToken as string;
    const struct = await createTeams(t.req, admin, { sportProfile: 'football' });
    const team = async (name: string) => {
      const sq = await struct.team(name);
      const st = await post(admin, `/teams/${sq.id}/seasons`, {
        name: '2026/27',
        ...season,
      });
      return { teamId: sq.id as string, seasonId: st.id as string };
    };
    const t1 = await team('T1');
    const t2 = await team('T2');
    const member = async (seasonId: string, addr: string, type: 'staff' | 'player') => {
      const p = await post(admin, '/people', {
        name: 'Carlo',
        surname: 'Neri',
        birthDate: '1985-02-03',
        email: addr,
      });
      await post(admin, `/seasons/${seasonId}/enrollments`, {
        personId: p.id,
        type,
        ...(type === 'staff' ? { staffRoleId: await roleId(t.req, admin, 'coach') } : {}),
      });
      await post(admin, '/invitations', {
        email: addr,
        role: type,
        personId: p.id,
      });
      return { ...(await accept(addr)), personId: p.id as string };
    };
    const coach1 = await member(t1.seasonId, `c1-${email}`, 'staff');
    const coach2 = await member(t2.seasonId, `c2-${email}`, 'staff');
    const player = await member(t1.seasonId, `p1-${email}`, 'player');
    for (const x of [t1, t2]) expect((await t.req('POST', `/seasons/${x.seasonId}/active`, { token: admin })).status).toBe(200);
    return {
      admin,
      clubId: c.body.activeClub.id as string,
      t1,
      t2,
      coach1,
      coach2,
      player,
    };
  }
  type Setup = Awaited<ReturnType<typeof club>>;

  const series = (extra: object = {}) => ({
    type: 'training',
    weekdays: ['TU', 'TH'],
    startDate: '2026-10-05',
    endDate: '2026-10-18',
    timeStart: '18:00',
    durationMinutes: 90,
    ...extra,
  });
  const createSeries = async (s: Setup, body: object = series()) => {
    const r = await send(s.coach1.token, 'POST', `/teams/${s.t1.teamId}/series`, body);
    expect(r.status).toBe(201);
    return r.body;
  };
  const events = async (s: Setup, token = s.coach1.token): Promise<Ev[]> => {
    const r = await send(token, 'GET', `/seasons/${s.t1.seasonId}/events`);
    expect(r.status).toBe(200);
    return r.body;
  };

  /** A series over every weekday around today: plenty of past and future sessions. */
  const aroundToday = (extra: object = {}) =>
    series({
      weekdays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
      startDate: day(-14),
      endDate: day(14),
      ...extra,
    });
  const aroundSeason = { startDate: day(-60), endDate: day(300) };

  describe('create', () => {
    it('a weekly series on Tuesday and Thursday has a training on every matching date of the period', async () => {
      const s = await club('se-1@test.it');
      const venue = await post(s.admin, '/venues', { name: 'Campo A' });
      const created = await createSeries(s, series({ title: 'Team training', venueId: venue.id }));
      expect(created).toMatchObject({
        type: 'training',
        title: 'Team training',
        weekdays: ['TU', 'TH'],
        intervalWeeks: 1,
        startDate: '2026-10-05',
        endDate: '2026-10-18',
        timeStart: '18:00',
        durationMinutes: 90,
        seasonId: s.t1.seasonId,
        teamId: s.t1.teamId,
        venue: { id: venue.id, name: 'Campo A' },
        eventCount: 4,
      });
      const list = await events(s);
      expect(list.map((e) => localDay(e.start))).toEqual(['2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15']);
      expect(list[0]).toMatchObject({
        type: 'training',
        title: 'Team training',
        status: 'scheduled',
        seriesId: created.id,
        exception: false,
        venue: { name: 'Campo A' },
        start: '2026-10-06T16:00:00.000Z',
        end: '2026-10-06T17:30:00.000Z',
      });
    });

    it('every second week counts from the week of the start date', async () => {
      const s = await club('se-2@test.it');
      await createSeries(s, series({ weekdays: ['TU'], intervalWeeks: 2, endDate: '2026-11-10' }));
      expect((await events(s)).map((e) => localDay(e.start))).toEqual(['2026-10-06', '2026-10-20', '2026-11-03']);
    });

    it('without an end date the series runs to the end of the season', async () => {
      const s = await club('se-3@test.it');
      const created = await createSeries(s, series({ weekdays: ['MO'], endDate: undefined }));
      expect(created.endDate).toBe(FIXED.endDate);
      const list = await events(s);
      expect(localDay(list[list.length - 1]?.start as string)).toBe('2027-06-28');
    });

    it('sessions keep the same local start time across both daylight saving changes', async () => {
      const s = await club('se-4@test.it');
      await createSeries(
        s,
        series({
          weekdays: ['SU'],
          startDate: '2026-10-18',
          endDate: '2027-04-04',
        }),
      );
      const list = await events(s);
      expect(new Set(list.map((e) => localTime(e.start)))).toEqual(new Set(['18:00']));
      const byDay = (d: string) => list.find((e) => localDay(e.start) === d)?.start;
      expect(byDay('2026-10-18')).toBe('2026-10-18T16:00:00.000Z');
      expect(byDay('2026-10-25')).toBe('2026-10-25T17:00:00.000Z');
      expect(byDay('2027-03-28')).toBe('2027-03-28T16:00:00.000Z');
    });

    it('an end date or a start date outside the season is refused and nothing is created', async () => {
      const s = await club('se-5@test.it');
      const url = `/teams/${s.t1.teamId}/series`;
      for (const over of [{ endDate: '2027-07-01' }, { startDate: '2026-08-31' }]) {
        const r = await send(s.coach1.token, 'POST', url, series(over));
        expect([r.status, r.body.code]).toEqual([400, 'SERIES_OUTSIDE_SEASON']);
      }
      expect(await events(s)).toEqual([]);
    });

    it('validations: period, no sessions, payload', async () => {
      const s = await club('se-6@test.it');
      const url = `/teams/${s.t1.teamId}/series`;
      const code = async (body: object) => {
        const r = await send(s.coach1.token, 'POST', url, body);
        return [r.status, r.body.code];
      };
      expect(await code(series({ endDate: '2026-10-04' }))).toEqual([400, 'INVALID_PERIOD_SERIES']);
      expect(await code(series({ weekdays: ['SU'], endDate: '2026-10-10' }))).toEqual([400, 'SERIES_WITHOUT_EVENTS']);
      expect(await code(series({ startDate: '2026-02-30' }))).toEqual([400, 'INVALID_DATA']);
      expect(await code(series({ weekdays: [] }))).toEqual([400, 'INVALID_DATA']);
      expect(await code(series({ weekdays: ['TU', 'TU'] }))).toEqual([400, 'INVALID_DATA']);
      expect(await code(series({ weekdays: ['XX'] }))).toEqual([400, 'INVALID_DATA']);
      expect(await code(series({ intervalWeeks: 0 }))).toEqual([400, 'INVALID_DATA']);
      expect(await code(series({ timeStart: '25:00' }))).toEqual([400, 'INVALID_DATA']);
      expect(await code(series({ durationMinutes: 0 }))).toEqual([400, 'INVALID_DATA']);
      expect(await code(series({ type: 'match' }))).toEqual([400, 'INVALID_DATA']);
      expect(await code({ ...series(), timeStart: undefined })).toEqual([400, 'INVALID_DATA']);
    });

    it('a player and the coach of another team are refused, a team of another club does not exist', async () => {
      const s = await club('se-7@test.it');
      const other = await club('se-7b@test.it');
      for (const who of [s.player, s.coach2]) {
        expect((await send(who.token, 'POST', `/teams/${s.t1.teamId}/series`, series())).body.code).toBe('PERMISSION_DENIED');
      }
      const r = await send(other.admin, 'POST', `/teams/${s.t1.teamId}/series`, series());
      expect([r.status, r.body.code]).toEqual([404, 'TEAM_NOT_FOUND']);
      expect(await events(s)).toEqual([]);
    });

    it('the admin can plan a series for any team', async () => {
      const s = await club('se-8@test.it');
      expect((await send(s.admin, 'POST', `/teams/${s.t2.teamId}/series`, series())).status).toBe(201);
    });
  });

  describe('read', () => {
    it('the coach reads the series to edit it; a player and another club cannot', async () => {
      const s = await club('se-9@test.it');
      const created = await createSeries(s, series({ intervalWeeks: 2 }));
      const r = await send(s.coach1.token, 'GET', `/series/${created.id}`);
      expect([r.status, r.body]).toEqual([200, created]);
      expect((await send(s.player.token, 'GET', `/series/${created.id}`)).body.code).toBe('PERMISSION_DENIED');
      const other = await club('se-9b@test.it');
      const x = await send(other.admin, 'GET', `/series/${created.id}`);
      expect([x.status, x.body.code]).toEqual([404, 'SERIES_NOT_FOUND']);
    });
  });

  describe('edit one session', () => {
    it('editing a session of a series marks it as an exception and leaves the others', async () => {
      const s = await club('se-10@test.it');
      const created = await createSeries(s);
      const [first, second] = await events(s);
      const r = await send(s.coach1.token, 'PATCH', `/events/${first?.id}`, {
        start: '2026-10-06T17:00:00Z',
        end: '2026-10-06T18:30:00Z',
      });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ seriesId: created.id, exception: true });
      const after = await events(s);
      expect(after.find((e) => e.id === second?.id)).toMatchObject({
        exception: false,
        start: second?.start,
      });
    });

    it('cancelling one session does not end the series, and a later change of the series does not bring it back', async () => {
      const s = await club('se-11@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      const future = (await events(s)).filter((e) => localDay(e.start) >= day(2));
      const victim = future[1] as Ev;
      expect((await send(s.coach1.token, 'POST', `/events/${victim.id}/cancel`)).status).toBe(200);

      expect(
        (
          await send(s.coach1.token, 'PATCH', `/series/${created.id}`, {
            timeStart: '19:00',
          })
        ).status,
      ).toBe(200);
      const after = await events(s);
      expect(after.find((e) => e.id === victim.id)).toMatchObject({
        status: 'cancelled',
        start: victim.start,
      });
      expect(after.filter((e) => localDay(e.start) === localDay(victim.start))).toHaveLength(1);
      expect(after.filter((e) => e.status === 'scheduled' && localDay(e.start) >= day(2)).length).toBe(future.length - 1);
    });
  });

  describe('edit all future sessions', () => {
    it('future untouched sessions move, past ones stay as they were, and sessions are changed in place', async () => {
      const s = await club('se-12@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      const before = await events(s);

      const r = await send(s.coach1.token, 'PATCH', `/series/${created.id}`, {
        timeStart: '19:00',
        durationMinutes: 60,
        title: 'Late training',
      });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({
        timeStart: '19:00',
        durationMinutes: 60,
        title: 'Late training',
        eventCount: before.length,
      });

      const after = await events(s);
      expect(after.map((e) => e.id)).toEqual(before.map((e) => e.id));
      for (const e of after) {
        if (localDay(e.start) <= day(-1)) {
          expect(e).toEqual(before.find((b) => b.id === e.id));
        } else if (localDay(e.start) >= day(1)) {
          expect(localTime(e.start)).toBe('19:00');
          expect(e.title).toBe('Late training');
          expect(new Date(e.end).getTime() - new Date(e.start).getTime()).toBe(60 * 60_000);
        }
      }
    });

    it('a session edited by hand is left unchanged', async () => {
      const s = await club('se-13@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      const target = (await events(s)).find((e) => localDay(e.start) === day(5)) as Ev;
      const moved = {
        start: new Date(Date.parse(target.start) + 3_600_000).toISOString(),
        end: new Date(Date.parse(target.end) + 3_600_000).toISOString(),
      };
      expect(
        (
          await send(s.coach1.token, 'PATCH', `/events/${target.id}`, {
            ...moved,
            note: 'Special',
          })
        ).status,
      ).toBe(200);

      expect(
        (
          await send(s.coach1.token, 'PATCH', `/series/${created.id}`, {
            timeStart: '20:00',
            title: 'New title',
          })
        ).status,
      ).toBe(200);
      const after = (await events(s)).find((e) => e.id === target.id);
      expect(after).toMatchObject({
        ...moved,
        exception: true,
        title: target.title,
      });
    });

    it('call-ups and attendance of a session are still there after the series is regenerated', async () => {
      const s = await club('se-14@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      const target = (await events(s)).find((e) => localDay(e.start) === day(4)) as Ev;
      const em = t.orm.em.fork();
      const enrollment = await em.findOneOrFail(Enrollment, { season: s.t1.seasonId, type: EnrollmentType.PLAYER }, { filters: false });
      const callup = em.create(Callup, {
        club: s.clubId,
        event: target.id,
        enrollment,
        response: CallupResponse.CONFIRMED,
      } as never);
      em.create(Attendance, {
        club: s.clubId,
        event: target.id,
        enrollment,
        outcome: AttendanceOutcome.PRESENT,
      } as never);
      await em.flush();

      expect(
        (
          await send(s.coach1.token, 'PATCH', `/series/${created.id}`, {
            timeStart: '20:00',
          })
        ).status,
      ).toBe(200);
      const check = t.orm.em.fork();
      const kept = await check.findOneOrFail(Callup, { id: callup.id }, { filters: false });
      expect([kept.response, kept.event.id]).toEqual([CallupResponse.CONFIRMED, target.id]);
      expect(await check.count(Attendance, { event: target.id }, { filters: false })).toBe(1);
      expect(localTime((await events(s)).find((e) => e.id === target.id)?.start as string)).toBe('20:00');
    });

    it('sessions that fall out of the rule are removed, unless they already have call-ups or attendance', async () => {
      const s = await club('se-15@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      const futureOn = (weekday: number) =>
        events(s).then((list) =>
          list.filter((e) => localDay(e.start) >= day(2) && new Date(`${localDay(e.start)}T12:00:00Z`).getUTCDay() === weekday),
        );
      const sundays = await futureOn(0);
      const protectedOne = sundays[0] as Ev;
      const em = t.orm.em.fork();
      const enrollment = await em.findOneOrFail(Enrollment, { season: s.t1.seasonId, type: EnrollmentType.PLAYER }, { filters: false });
      em.create(Callup, {
        club: s.clubId,
        event: protectedOne.id,
        enrollment,
      } as never);
      await em.flush();

      expect(
        (
          await send(s.coach1.token, 'PATCH', `/series/${created.id}`, {
            weekdays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA'],
          })
        ).status,
      ).toBe(200);
      const left = await futureOn(0);
      expect(left.map((e) => e.id)).toEqual([protectedOne.id]);
      expect(left[0]).toMatchObject({ exception: true, status: 'scheduled' });
    });

    it('extending the end date adds the new sessions and keeps the existing ones', async () => {
      const s = await club('se-16@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday({ weekdays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] }));
      const before = await events(s);
      const r = await send(s.coach1.token, 'PATCH', `/series/${created.id}`, {
        endDate: day(20),
      });
      expect(r.status).toBe(200);
      const after = await events(s);
      expect(after.length).toBe(before.length + 6);
      for (const e of before) expect(after.map((x) => x.id)).toContain(e.id);
    });

    it('validations: the end date must stay inside the season and the data must be valid', async () => {
      const s = await club('se-17@test.it');
      const created = await createSeries(s);
      const url = `/series/${created.id}`;
      const code = async (body: object) => {
        const r = await send(s.coach1.token, 'PATCH', url, body);
        return [r.status, r.body.code];
      };
      expect(await code({ endDate: '2027-07-01' })).toEqual([400, 'SERIES_OUTSIDE_SEASON']);
      expect(await code({ endDate: '2026-10-04' })).toEqual([400, 'INVALID_PERIOD_SERIES']);
      expect(await code({ weekdays: [] })).toEqual([400, 'INVALID_DATA']);
      expect(await code({ timeStart: '99:00' })).toEqual([400, 'INVALID_DATA']);
      expect(await code({ intervalWeeks: 99 })).toEqual([400, 'INVALID_DATA']);
      expect(await events(s)).toHaveLength(4);
    });

    it('a player and the coach of another team are refused, another club does not see it, a closed season is read-only', async () => {
      const s = await club('se-18@test.it');
      const created = await createSeries(s);
      const url = `/series/${created.id}`;
      for (const who of [s.player, s.coach2]) {
        expect((await send(who.token, 'PATCH', url, { timeStart: '19:00' })).body.code).toBe('PERMISSION_DENIED');
      }
      const other = await club('se-18b@test.it');
      const x = await send(other.admin, 'PATCH', url, { timeStart: '19:00' });
      expect([x.status, x.body.code]).toEqual([404, 'SERIES_NOT_FOUND']);

      expect(
        (
          await t.req('POST', `/seasons/${s.t1.seasonId}/close`, {
            token: s.admin,
          })
        ).status,
      ).toBe(200);
      const closed = await send(s.admin, 'PATCH', url, { timeStart: '19:00' });
      expect([closed.status, closed.body.code]).toEqual([409, 'SEASON_CLOSED']);
    });
  });

  describe('remove all future sessions', () => {
    const url = (id: string) => `/series/${id}/future-sessions`;
    const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
    /** A session goes while its attendance check (30 minutes before the start) has not opened. */
    const goes = (e: Ev, cutoff: number) => Date.parse(e.start) > cutoff;
    const checkOpensIn = () => Date.now() + 30 * 60_000;
    const move = async (s: Setup, id: string, start: Date, minutes = 90) => {
      const r = await send(s.coach1.token, 'PATCH', `/events/${id}`, {
        start: start.toISOString(),
        end: new Date(start.getTime() + minutes * 60_000).toISOString(),
      });
      expect(r.status).toBe(200);
    };
    const playerOf = (s: Setup) =>
      t.orm.em.fork().findOneOrFail(Enrollment, { season: s.t1.seasonId, type: EnrollmentType.PLAYER }, { filters: false });
    const callupOn = async (s: Setup, eventId: string, over: object = {}) => {
      const em = t.orm.em.fork();
      const c = em.create(Callup, { club: s.clubId, event: eventId, enrollment: await playerOf(s), ...over } as never);
      await em.flush();
      return c;
    };
    const countCallups = (eventIds: string[]) => t.orm.em.fork().count(Callup, { event: { $in: eventIds } }, { filters: false });
    const countAttendances = (eventIds: string[]) => t.orm.em.fork().count(Attendance, { event: { $in: eventIds } }, { filters: false });

    it('removes every session whose check has not opened, ends the series the day before the first one and keeps the past', async () => {
      const s = await club('rm-1@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      const before = await events(s);
      const cutoff = checkOpensIn();
      const gone = before.filter((e) => goes(e, cutoff));
      const stays = before.filter((e) => !goes(e, cutoff));
      expect(gone.length).toBeGreaterThan(10);
      expect(stays.length).toBeGreaterThan(10);

      const r = await send(s.coach1.token, 'DELETE', url(created.id));
      expect([r.status, r.body]).toEqual([200, { sessions: gone.length, players: 0, kept: stays.length }]);
      expect((await events(s)).map((e) => e.id)).toEqual(stays.map((e) => e.id));
      const after = await send(s.coach1.token, 'GET', `/series/${created.id}`);
      expect(after.body).toMatchObject({ endDate: dayBefore(localDay((gone[0] as Ev).start)), eventCount: stays.length });
    });

    it('a series ended this way is not filled again by a later change of the series', async () => {
      const s = await club('rm-2@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      expect((await send(s.coach1.token, 'DELETE', url(created.id))).status).toBe(200);
      const left = await events(s);
      expect((await send(s.coach1.token, 'PATCH', `/series/${created.id}`, { timeStart: '19:00' })).status).toBe(200);
      expect((await events(s)).map((e) => e.id)).toEqual(left.map((e) => e.id));
    });

    it('removes the sessions edited by hand and the cancelled ones too, with their call-ups and responses, and leaves plain events alone', async () => {
      const s = await club('rm-3@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      const list = await events(s);
      const on = (offset: number) => list.find((e) => localDay(e.start) === day(offset)) as Ev;
      const [edited, cancelled, answered] = [on(3), on(4), on(5)];
      await move(s, edited.id, new Date(Date.parse(edited.start) + 3_600_000));
      expect((await send(s.coach1.token, 'POST', `/events/${(cancelled as Ev).id}/cancel`)).status).toBe(200);
      await callupOn(s, (answered as Ev).id, { response: CallupResponse.CONFIRMED, notifiedAt: new Date() });
      await callupOn(s, (cancelled as Ev).id);
      const plain = await send(s.coach1.token, 'POST', `/teams/${s.t1.teamId}/events`, {
        type: 'training',
        start: `${day(6)}T15:00:00Z`,
        end: `${day(6)}T16:00:00Z`,
      });
      expect(await countCallups([(answered as Ev).id, (cancelled as Ev).id])).toBe(2);

      expect((await send(s.coach1.token, 'DELETE', url(created.id))).status).toBe(200);
      const after = (await events(s)).map((e) => e.id);
      for (const e of [edited, cancelled, answered]) expect(after).not.toContain((e as Ev).id);
      expect(after).toContain(plain.body.id);
      expect(await countCallups([(answered as Ev).id, (cancelled as Ev).id])).toBe(0);
    });

    it('keeps a session in progress and one whose check is open, with their call-ups and attendance, and the held ones', async () => {
      const s = await club('rm-4@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      const list = await events(s);
      const [running, open] = [list.find((e) => localDay(e.start) === day(2)) as Ev, list.find((e) => localDay(e.start) === day(3)) as Ev];
      await move(s, running.id, new Date(Date.now() - 30 * 60_000), 90); // started half an hour ago
      await move(s, open.id, new Date(Date.now() + 10 * 60_000)); // the check opened 20 minutes ago
      const enrollment = await playerOf(s);
      const em = t.orm.em.fork();
      for (const e of [running, open]) {
        em.create(Callup, { club: s.clubId, event: e.id, enrollment, response: CallupResponse.CONFIRMED } as never);
        em.create(Attendance, { club: s.clubId, event: e.id, enrollment, outcome: AttendanceOutcome.PRESENT } as never);
      }
      await em.flush();

      const cutoff = checkOpensIn();
      const held = list.filter((e) => !goes(e, cutoff)).map((e) => e.id);
      expect((await send(s.coach1.token, 'DELETE', url(created.id))).status).toBe(200);
      expect((await events(s)).map((e) => e.id).sort()).toEqual([...new Set([...held, running.id, open.id])].sort());
      expect(await countCallups([running.id, open.id])).toBe(2);
      expect(await countAttendances([running.id, open.id])).toBe(2);
    });

    it('a future session that already has attendance stays, because attendance is never lost', async () => {
      const s = await club('rm-5@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      const target = (await events(s)).find((e) => localDay(e.start) === day(8)) as Ev;
      const em = t.orm.em.fork();
      em.create(Attendance, { club: s.clubId, event: target.id, enrollment: await playerOf(s), outcome: AttendanceOutcome.PRESENT } as never);
      await em.flush();
      const r = await send(s.coach1.token, 'DELETE', url(created.id));
      expect(r.status).toBe(200);
      expect((await events(s)).filter((e) => localDay(e.start) >= day(2)).map((e) => e.id)).toEqual([target.id]);
      expect(await countAttendances([target.id])).toBe(1);
    });

    it('a series with no past session disappears with all its sessions', async () => {
      const s = await club('rm-6@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday({ startDate: day(3), endDate: day(10) }));
      const total = (await events(s)).length;
      const r = await send(s.coach1.token, 'DELETE', url(created.id));
      expect([r.status, r.body]).toEqual([200, { sessions: total, players: 0, kept: 0 }]);
      expect(await events(s)).toEqual([]);
      const gone = await send(s.coach1.token, 'GET', `/series/${created.id}`);
      expect([gone.status, gone.body.code]).toEqual([404, 'SERIES_NOT_FOUND']);
    });

    it('with nothing to remove it changes nothing', async () => {
      const s = await club('rm-7@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday({ startDate: day(-14), endDate: day(-3) }));
      const before = await events(s);
      const r = await send(s.coach1.token, 'DELETE', url(created.id));
      expect([r.status, r.body]).toEqual([200, { sessions: 0, players: 0, kept: before.length }]);
      expect(await events(s)).toEqual(before);
      expect((await send(s.coach1.token, 'GET', `/series/${created.id}`)).body.endDate).toBe(day(-3));
    });

    it('the confirmation counts sessions, players with a call-up or a response (sent or not, each once) and the sessions that stay, and changes nothing', async () => {
      const s = await club('rm-8@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      const list = await events(s);
      const cutoff = checkOpensIn();
      const [a, b] = list.filter((e) => goes(e, cutoff)) as [Ev, Ev];
      await callupOn(s, a.id);
      await callupOn(s, b.id, { response: CallupResponse.DECLINED, notifiedAt: new Date() });
      const past = list.find((e) => !goes(e, cutoff)) as Ev;
      await callupOn(s, past.id); // on a session that stays: not counted

      const r = await send(s.coach1.token, 'GET', url(created.id));
      expect([r.status, r.body]).toEqual([
        200,
        { sessions: list.filter((e) => goes(e, cutoff)).length, players: 1, kept: list.filter((e) => !goes(e, cutoff)).length },
      ]);
      expect(await events(s)).toEqual(list);
    });

    it('a staff member who answered is not a player: the confirmation does not count it, the removal still deletes its answer', async () => {
      const s = await club('rm-11@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      const target = (await events(s)).find((e) => localDay(e.start) === day(8)) as Ev;
      await callupOn(s, target.id);
      const staff = await t.orm.em.fork().findOneOrFail(Enrollment, { season: s.t1.seasonId, type: EnrollmentType.STAFF }, { filters: false });
      const em = t.orm.em.fork();
      em.create(Callup, { club: s.clubId, event: target.id, enrollment: staff, response: CallupResponse.CONFIRMED } as never);
      await em.flush();
      expect(await countCallups([target.id])).toBe(2);

      const preview = await send(s.coach1.token, 'GET', url(created.id));
      expect(preview.body.players).toBe(1);
      const r = await send(s.coach1.token, 'DELETE', url(created.id));
      expect([r.status, r.body.players]).toEqual([200, 1]);
      expect(await countCallups([target.id])).toBe(0);
    });

    it('a player and the coach of another team are refused, another club does not see it, the admin can', async () => {
      const s = await club('rm-9@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      const before = await events(s);
      for (const who of [s.player, s.coach2]) {
        for (const method of ['GET', 'DELETE']) {
          expect((await send(who.token, method, url(created.id))).body.code).toBe('PERMISSION_DENIED');
        }
      }
      const other = await club('rm-9b@test.it');
      for (const method of ['GET', 'DELETE']) {
        const x = await send(other.admin, method, url(created.id));
        expect([x.status, x.body.code]).toEqual([404, 'SERIES_NOT_FOUND']);
      }
      expect(await events(s)).toEqual(before);
      expect((await send(s.admin, 'DELETE', url(created.id))).status).toBe(200);
    });

    it('a closed season refuses it and nothing is removed', async () => {
      const s = await club('rm-10@test.it', aroundSeason);
      const created = await createSeries(s, aroundToday());
      const before = await events(s);
      expect((await t.req('POST', `/seasons/${s.t1.seasonId}/close`, { token: s.admin })).status).toBe(200);
      for (const method of ['GET', 'DELETE']) {
        const r = await send(s.admin, method, url(created.id));
        expect([r.status, r.body.code]).toEqual([409, 'SEASON_CLOSED']);
      }
      expect(await events(s, s.admin)).toEqual(before);
    });
  });

  it('keeps events apart: a plain event has no series and is never regenerated', async () => {
    const s = await club('se-19@test.it', aroundSeason);
    const created = await createSeries(s, aroundToday());
    const plain = await send(s.coach1.token, 'POST', `/teams/${s.t1.teamId}/events`, {
      type: 'training',
      start: `${day(6)}T15:00:00Z`,
      end: `${day(6)}T16:00:00Z`,
    });
    expect(plain.body).toMatchObject({ seriesId: null, exception: false });
    expect(
      (
        await send(s.coach1.token, 'PATCH', `/series/${created.id}`, {
          timeStart: '19:00',
        })
      ).status,
    ).toBe(200);
    const em = t.orm.em.fork();
    const row = await em.findOneOrFail(Event, { id: plain.body.id }, { filters: false });
    expect(row.start.toISOString()).toBe(`${day(6)}T15:00:00.000Z`);
  });
});
