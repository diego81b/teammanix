import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Absence } from '../src/entities/absence.entity';
import { AuditLog } from '../src/entities/audit-log.entity';
import { Consent } from '../src/entities/consent.entity';
import { ConsentStatus, ConsentType, GuardianRelation } from '../src/entities/enums';
import { GuardianLink } from '../src/entities/guardian-link.entity';
import { Notification } from '../src/entities/notification.entity';
import { Person } from '../src/entities/person.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { StorageService } from '../src/storage/storage.service';
import { Environment, PASSWORD, startEnvironment } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const slot = (offset: number) => ({ start: `${day(offset)}T16:00:00Z`, end: `${day(offset)}T17:30:00Z` });
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('certificate content')]);

describe('export and permanent deletion of people (art. 15, 17, 20)', () => {
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

  const send = (token: string, method: string, url: string, body?: object) => t.req(method, url, { token, body });
  const post = async (token: string, url: string, body: object = {}) => {
    const r = await t.req('POST', url, { token, body });
    expect([200, 201]).toContain(r.status);
    return r.body;
  };
  const code = (r: { status: number; body: { code?: string } }) => [r.status, r.body?.code];
  const upload = (token: string, certId: string) =>
    t.app.inject({ method: 'PUT', url: `/api/certificates/${certId}/file`, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/pdf' }, payload: PDF });
  const exportOf = (token: string, personId: string) => t.app.inject({ method: 'GET', url: `/api/people/${personId}/export`, headers: { authorization: `Bearer ${token}` } });
  const files = async (clubId: string) => readdir(join(t.storageDir, clubId)).catch(() => [] as string[]);
  const audit = (action: string, entityId: string) => t.orm.em.fork().find(AuditLog, { action: action as never, entityId }, { filters: false });

  async function accept(email: string) {
    const u = await t.newUser(email);
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
    expect(acc.status).toBe(200);
    return { token: acc.body.accessToken as string, userId: u.user.id as string };
  }

  /** A club with a coach, a mate and a player with an account and a full history. */
  async function club(email: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    const admin = c.body.accessToken as string;
    const clubId = c.body.activeClub.id as string;
    await send(admin, 'PATCH', '/club/current/settings', { certificatesWithFile: true });
    const act = await post(admin, '/activities', { name: 'Sport', sportProfile: 'football' });
    const team = await post(admin, `/activities/${act.id}/teams`, { name: 'T1' });
    const season = await post(admin, `/teams/${team.id}/seasons`, { name: 'Now', startDate: day(-60), endDate: day(400) });
    const withAccount = async (tag: string, type: 'player' | 'staff', staffRole?: string) => {
      const p = await post(admin, '/people', { name: tag, surname: 'Rossi', birthDate: '2000-01-01', email: `${tag}-${email}` });
      const enrollment = await post(admin, `/seasons/${season.id}/enrollments`, { personId: p.id, type, ...(staffRole ? { staffRole } : {}) });
      await post(admin, '/invitations', { email: `${tag}-${email}`, role: type, personId: p.id });
      return { ...(await accept(`${tag}-${email}`)), personId: p.id as string, enrollmentId: enrollment.id as string, email: `${tag}-${email}` };
    };
    const coach = await withAccount('c1', 'staff', 'coach');
    const player = await withAccount('p1', 'player');
    const mate = await withAccount('p2', 'player');
    expect((await send(admin, 'POST', `/seasons/${season.id}/active`)).status).toBe(200);

    const cert = await post(admin, `/people/${player.personId}/certificates`, { type: 'competitive', issueDate: day(-10), expiryDate: day(355) });
    expect((await upload(admin, cert.id)).statusCode).toBe(200);
    const past = await post(admin, `/teams/${team.id}/events`, { type: 'training', ...slot(-3) });
    for (const [id, outcome] of [[player.enrollmentId, 'present'], [mate.enrollmentId, 'absent'], [coach.enrollmentId, 'present']]) {
      expect((await send(coach.token, 'PUT', `/events/${past.id}/attendance/${id}`, { outcome })).status).toBe(200);
    }
    const future = await post(admin, `/teams/${team.id}/events`, { type: 'training', ...slot(5) });
    await post(coach.token, `/events/${future.id}/callups`, { enrollmentId: player.enrollmentId });
    await post(player.token, `/enrollments/${player.enrollmentId}/absences`, { startDate: day(20), endDate: day(22) });
    await post(coach.token, `/enrollments/${player.enrollmentId}/suspensions`, { form: 'period', startDate: day(30), endDate: day(40) });
    expect((await send(coach.token, 'PUT', `/enrollments/${player.enrollmentId}/expected-injury`, { startDate: day(50), returnDate: day(60) })).status).toBe(200);
    const em = t.orm.em.fork();
    em.create(Consent, { club: clubId, person: player.personId, type: ConsentType.IMAGES, status: ConsentStatus.GRANTED } as never);
    em.create(GuardianLink, { club: clubId, minor: mate.personId, guardian: player.personId, relation: GuardianRelation.PARENT } as never);
    await em.flush();

    const manager = async () => {
      await post(admin, '/invitations', { email: `mg-${email}`, role: 'manager' });
      return accept(`mg-${email}`);
    };
    const disable = async (personId: string) => expect((await send(admin, 'POST', `/people/${personId}/disable`)).status).toBe(200);
    return { admin, clubId, seasonId: season.id as string, teamId: team.id as string, coach, player, mate, certId: cert.id as string, past, future, manager, disable };
  }

  describe('export', () => {
    it('gives the admin a JSON file with all the data the club keeps for a disabled person', async () => {
      const s = await club('er-01@test.it');
      await s.disable(s.player.personId);

      const r = await exportOf(s.admin, s.player.personId);
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toMatch(/application\/json/);
      expect(r.headers['content-disposition']).toBe(`attachment; filename="person-${s.player.personId}.json"`);
      const body = r.json();
      expect(body.person).toMatchObject({ id: s.player.personId, name: 'p1', surname: 'Rossi', birthDate: '2000-01-01', email: s.player.email, hasAccount: true });
      expect(body.enrollments).toHaveLength(1);
      const e = body.enrollments[0];
      expect(e).toMatchObject({ team: 'T1', season: 'Now', type: 'player', expectedInjury: { startDate: day(50), returnDate: day(60) } });
      expect(e.attendance).toEqual([expect.objectContaining({ eventId: s.past.id, outcome: 'present' })]);
      expect(e.callups).toEqual([expect.objectContaining({ eventId: s.future.id, response: 'pending' })]);
      expect(e.absences).toEqual([{ startDate: day(20), endDate: day(22) }]);
      expect(e.suspensions).toEqual([expect.objectContaining({ form: 'period', startDate: day(30), endDate: day(40) })]);
      expect(body.certificates).toEqual([expect.objectContaining({ type: 'competitive', expiryDate: day(355), file: expect.objectContaining({ mime: 'application/pdf' }) })]);
      expect(body.consents).toEqual([expect.objectContaining({ type: 'images', status: 'granted' })]);
      expect(body.guardianLinks).toEqual([{ role: 'guardian', relation: 'parent' }]);
      expect(body.invitations).toEqual([expect.objectContaining({ email: s.player.email, role: 'player' })]);
      // Never storage keys or file content, never other people's data.
      expect(r.body).not.toMatch(/storageKey|certificate content|p2/);
    });

    it('refuses an active person', async () => {
      const s = await club('er-02@test.it');
      const r = await exportOf(s.admin, s.player.personId);
      expect([r.statusCode, r.json().code]).toEqual([409, 'PERSON_NOT_DISABLED']);
    });
  });

  describe('permanent deletion', () => {
    it('refuses an active person and leaves everything in place', async () => {
      const s = await club('er-03@test.it');
      expect(code(await send(s.admin, 'DELETE', `/people/${s.player.personId}`))).toEqual([409, 'PERSON_NOT_DISABLED']);
      expect(await files(s.clubId)).toHaveLength(1);
      expect((await send(s.admin, 'GET', `/people/${s.player.personId}`)).body.name).toBe('p1');
    });

    it('removes the files from storage and the sensitive records, anonymizes the record', async () => {
      const s = await club('er-04@test.it');
      await s.disable(s.player.personId);
      expect(await files(s.clubId)).toHaveLength(1);
      const sent = await t.orm.em.fork().find(Notification, { club: s.clubId }, { filters: false });
      expect(JSON.stringify(sent.map((n) => n.params))).toContain('p1 Rossi');
      const [traced] = await t.orm.em.fork().getConnection().execute(
        `select count(*)::int as n from audit_log where club_id = ? and meta is not null and (entity_id = ? or meta->>'enrollmentId' = ?)`,
        [s.clubId, s.player.enrollmentId, s.player.enrollmentId],
      );
      expect(traced.n).toBeGreaterThan(0);

      expect((await send(s.admin, 'DELETE', `/people/${s.player.personId}`)).status).toBe(204);

      expect(await files(s.clubId)).toHaveLength(0);
      const em = t.orm.em.fork();
      const q = { filters: false } as const;
      const p = await em.findOneOrFail(Person, s.player.personId, q);
      expect(p).toMatchObject({ name: '', surname: null, birthDate: null, email: null, phone: null, photoUrl: null, completedAt: null, user: null });
      expect(p.anonymizedAt).toBeInstanceOf(Date);
      for (const [table, where] of [
        ['medical_certificates', `person_id = '${s.player.personId}'`],
        ['documents', `person_id = '${s.player.personId}'`],
        ['consents', `person_id = '${s.player.personId}'`],
        ['guardian_links', `minor_id = '${s.player.personId}' or guardian_id = '${s.player.personId}'`],
        ['invitations', `person_id = '${s.player.personId}' or email = '${s.player.email}'`],
        ['expected_injuries', `enrollment_id = '${s.player.enrollmentId}'`],
      ]) {
        const rows = await em.getConnection().execute(`select count(*)::int as n from ${table} where ${where}`);
        expect([table, rows[0].n]).toEqual([table, 0]);
      }
      // Absences and suspensions stay for the team figures.
      for (const table of ['absences', 'suspensions']) {
        const rows = await em.getConnection().execute(`select count(*)::int as n from ${table} where enrollment_id = ?`, [s.player.enrollmentId]);
        expect([table, rows[0].n]).toEqual([table, 1]);
      }
      // Notifications naming the person go.
      const kept = await em.find(Notification, { club: s.clubId }, q);
      expect(JSON.stringify(kept.map((n) => n.params))).not.toContain('p1 Rossi');
      // The audit keeps who and when, not the details.
      const trail = `select count(*)::int as n from audit_log where club_id = ? and meta is not null
        and (entity_id = any(?::uuid[]) or meta->>'enrollmentId' = ?)`;
      const [absence] = await em.getConnection().execute('select id from absences where enrollment_id = ?', [s.player.enrollmentId]);
      const [suspension] = await em.getConnection().execute('select id from suspensions where enrollment_id = ?', [s.player.enrollmentId]);
      const ids = `{${[s.player.enrollmentId, absence.id, suspension.id].join(',')}}`;
      expect((await em.getConnection().execute(trail, [s.clubId, ids, s.player.enrollmentId]))[0].n).toBe(0);
      // Gone for the club: not in the archive, no detail, no second export or deletion.
      expect((await send(s.admin, 'GET', '/people/disabled')).body.map((x: { id: string }) => x.id)).not.toContain(s.player.personId);
      expect(code(await send(s.admin, 'GET', `/people/${s.player.personId}`))).toEqual([404, 'PERSON_NOT_FOUND']);
      expect(code(await send(s.admin, 'DELETE', `/people/${s.player.personId}`))).toEqual([404, 'PERSON_NOT_FOUND']);
      expect((await exportOf(s.admin, s.player.personId)).statusCode).toBe(404);
      expect(code(await send(s.admin, 'POST', `/people/${s.player.personId}/reenable`))).toEqual([404, 'PERSON_NOT_FOUND']);
    });

    it('keeps the attendance figures of the team and shows the row without a name', async () => {
      const s = await club('er-05@test.it');
      // A served suspension and a past absence: both counted in the figures before the deletion.
      await post(s.admin, `/teams/${s.teamId}/events`, { type: 'match', ...slot(-2), opponent: 'Rivals', homeAway: 'home', competition: 'League' });
      await post(s.coach.token, `/enrollments/${s.player.enrollmentId}/suspensions`, { form: 'period', startDate: day(-4), endDate: day(-1) });
      const em = t.orm.em.fork();
      em.create(Absence, { club: s.clubId, enrollment: s.player.enrollmentId, startDate: day(-12), endDate: day(-10) } as never);
      await em.flush();
      await s.disable(s.player.personId);
      const before = (await send(s.coach.token, 'GET', `/seasons/${s.seasonId}/statistics`)).body;
      expect(before.rows.find((x: { enrollmentId: string }) => x.enrollmentId === s.player.enrollmentId)).toMatchObject({ absenceDays: 3, suspendedMatches: 1 });

      expect((await send(s.admin, 'DELETE', `/people/${s.player.personId}`)).status).toBe(204);

      for (const token of [s.coach.token, s.admin]) {
        const after = (await send(token, 'GET', `/seasons/${s.seasonId}/statistics`)).body;
        const row = after.rows.find((x: { enrollmentId: string }) => x.enrollmentId === s.player.enrollmentId);
        expect(row).toMatchObject({ present: 1, attended: 1, absenceDays: 3, suspendedMatches: 1, disabled: true });
        expect(row.name || null).toBeNull();
        expect(row.surname).toBeNull();
        expect(after.totals).toMatchObject({ present: before.totals.present, absent: before.totals.absent, attended: before.totals.attended, rate: before.totals.rate, absenceDays: before.totals.absenceDays, suspendedMatches: before.totals.suspendedMatches });
      }
      const sheet = (await send(s.coach.token, 'GET', `/events/${s.past.id}/attendance`)).body;
      expect(sheet.rows.find((x: { enrollmentId: string }) => x.enrollmentId === s.player.enrollmentId)).toMatchObject({ outcome: 'present', disabled: true });
    });

    it('leaves the account working, out of the club', async () => {
      const s = await club('er-06@test.it');
      await s.disable(s.player.personId);
      expect((await send(s.admin, 'DELETE', `/people/${s.player.personId}`)).status).toBe(204);

      const login = await t.req('POST', '/auth/login', { body: { email: s.player.email, password: PASSWORD } });
      expect(login.status).toBe(200);
      expect(login.body.memberships.map((m: { clubId: string }) => m.clubId)).not.toContain(s.clubId);
      const em = t.orm.em.fork();
      const rows = await em.getConnection().execute(
        `select (select count(*) from memberships where user_id = ? and club_id = ?)::int + (select count(*) from access_roles where user_id = ? and club_id = ?)::int as n`,
        [s.player.userId, s.clubId, s.player.userId, s.clubId],
      );
      expect(rows[0].n).toBe(0);
    });

    it('an interrupted deletion completes on retry', async () => {
      const s = await club('er-07@test.it');
      const second = await post(s.admin, `/people/${s.player.personId}/certificates`, { type: 'competitive', issueDate: day(-400), expiryDate: day(-35) });
      expect((await upload(s.admin, second.id)).statusCode).toBe(200);
      await s.disable(s.player.personId);
      expect(await files(s.clubId)).toHaveLength(2);

      const storage = t.app.get(StorageService);
      const original = storage.remove.bind(storage);
      const spy = jest.spyOn(storage, 'remove').mockImplementationOnce(original).mockRejectedValueOnce(new Error('storage down'));
      try {
        expect((await send(s.admin, 'DELETE', `/people/${s.player.personId}`)).status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(await files(s.clubId)).toHaveLength(1);
      expect((await send(s.admin, 'GET', `/people/${s.player.personId}`)).body.name).toBe('p1');

      expect((await send(s.admin, 'DELETE', `/people/${s.player.personId}`)).status).toBe(204);
      expect(await files(s.clubId)).toHaveLength(0);
    });
  });

  describe('access and audit', () => {
    it('a manager can neither export nor delete', async () => {
      const s = await club('er-08@test.it');
      await s.disable(s.player.personId);
      const m = await s.manager();
      expect((await exportOf(m.token, s.player.personId)).statusCode).toBe(403);
      expect((await send(m.token, 'DELETE', `/people/${s.player.personId}`)).status).toBe(403);
      expect(await files(s.clubId)).toHaveLength(1);
    });

    it('another club cannot reach the person', async () => {
      const s = await club('er-09@test.it');
      const other = await club('er-09b@test.it');
      await s.disable(s.player.personId);
      expect(code(await send(other.admin, 'DELETE', `/people/${s.player.personId}`))).toEqual([404, 'PERSON_NOT_FOUND']);
      expect((await exportOf(other.admin, s.player.personId)).statusCode).toBe(404);
      expect(await files(s.clubId)).toHaveLength(1);
    });

    it('both actions are audited without personal data or file content', async () => {
      const s = await club('er-10@test.it');
      await s.disable(s.player.personId);
      await exportOf(s.admin, s.player.personId);
      expect((await send(s.admin, 'DELETE', `/people/${s.player.personId}`)).status).toBe(204);
      const rows = [...(await audit('person_exported', s.player.personId)), ...(await audit('person_deleted', s.player.personId))];
      expect(rows.map((r) => r.action).sort()).toEqual(['person_deleted', 'person_exported']);
      for (const r of rows) {
        expect(r.club?.id).toBe(s.clubId);
        expect(JSON.stringify(r.meta ?? {})).not.toMatch(/p1|Rossi|@|2000-01-01|certificate content/);
      }
    });
  });
});
