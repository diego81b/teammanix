import { AuditLog } from '../src/entities/audit-log.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment, createTeams, roleId } from './helpers';

/** ISO date `days` from today (UTC, like the service). */
const between = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe('medical certificates (data)', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
    const em = t.orm.em.fork();
    em.create(SportProfile, { code: 'football', positions: ['goalkeeper', 'defender', 'midfielder', 'forward'], modulesAvailable: ['attendances'] } as never);
    await em.flush();
  });
  afterAll(async () => {
    await t?.close();
  });

  async function context(email: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    const token = c.body.accessToken as string;
    const struct = await createTeams(t.req, token, { sportProfile: 'football' });
    const sq = await struct.team('Under 15');
    const st = (await t.req('POST', `/teams/${sq.id}/seasons`, { token, body: { name: '2026/27', startDate: '2026-09-01', endDate: '2027-06-30' } })).body;
    return { token, seasonId: st.id as string };
  }

  async function player(a: { token: string; seasonId: string }, name = 'Luca') {
    const p = (await t.req('POST', '/people', { token: a.token, body: { name, surname: 'Verdi', birthDate: '2010-03-04', email: `${name.toLowerCase()}@test.it` } })).body;
    await t.req('POST', `/seasons/${a.seasonId}/enrollments`, { token: a.token, body: { personId: p.id, type: 'player' } });
    return p.id as string;
  }

  const create = (token: string, personId: string, body: object) => t.req('POST', `/people/${personId}/certificates`, { token, body });
  const data = (extra: object = {}) => ({ type: 'competitive', issueDate: between(-10), expiryDate: between(355), ...extra });
  const audit = (action: string, entityId: string) => t.orm.em.fork().find(AuditLog, { action: action as never, entityId }, { filters: false });

  describe('creation and reading', () => {
    it('creates a certificate without a file and returns it with its status', async () => {
      const a = await context('ce-1@test.it');
      const p = await player(a);
      const r = await create(a.token, p, data());
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ type: 'competitive', issueDate: between(-10), expiryDate: between(355), status: 'valid', hasFile: false });
      expect(JSON.stringify(r.body)).not.toMatch(/fileKey|storageKey/);
      expect(await audit('certificate_modified', r.body.id)).toHaveLength(1);
    });

    it('lists the person\'s certificates: the one with the furthest expiry is current, access is audited', async () => {
      const a = await context('ce-2@test.it');
      const p = await player(a);
      await create(a.token, p, data({ issueDate: between(-400), expiryDate: between(-35) }));
      const fresh = await create(a.token, p, data({ type: 'not_competitive', expiryDate: between(20) }));
      const r = await t.req('GET', `/people/${p}/certificates`, { token: a.token });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: 'expiring', expiry: between(20) });
      expect(r.body.certificates.map((c: { id: string }) => c.id)[0]).toBe(fresh.body.id);
      expect(r.body.certificates).toHaveLength(2);
      expect(await audit('certificate_read', p)).toHaveLength(1);
      await t.req('GET', `/people/${p}/certificates`, { token: a.token });
      expect(await audit('certificate_read', p)).toHaveLength(2);
    });

    it('statuses: missing, valid, expiring, expired', async () => {
      const a = await context('ce-3@test.it');
      const status = async (p: string) => (await t.req('GET', `/people/${p}/certificates`, { token: a.token })).body.status;
      const without = await player(a, 'Anna');
      expect(await status(without)).toBe('missing');
      const cases: [string, number, string][] = [['Bea', 120, 'valid'], ['Carla', 30, 'expiring'], ['Dora', 31, 'valid'], ['Elsa', -1, 'expired'], ['Fede', 0, 'expiring']];
      for (const [name, days, expected] of cases) {
        const p = await player(a, name);
        await create(a.token, p, data({ issueDate: between(-500), expiryDate: between(days) }));
        expect([name, await status(p)]).toEqual([name, expected]);
      }
    });

    it('validation: dates, type, missing fields', async () => {
      const a = await context('ce-4@test.it');
      const p = await player(a);
      const tryValue = async (body: object) => create(a.token, p, body);
      for (const body of [data({ expiryDate: between(-20) }), data({ issueDate: between(3) }), data({ expiryDate: '2027-02-30' })]) {
        const r = await tryValue(body);
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATE_CERTIFICATE']);
      }
      for (const body of [data({ type: 'unknown' }), data({ issueDate: undefined }), data({ note: 'diagnosis' }), {}]) {
        const r = await tryValue(body);
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATA']);
      }
    });

    it('unknown person or from another club: 404; disabled: 409', async () => {
      const a = await context('ce-5a@test.it');
      const b = await context('ce-5b@test.it');
      const pb = await player(b);
      for (const id of [pb, crypto.randomUUID()]) {
        expect([(await create(a.token, id, data())).status, (await t.req('GET', `/people/${id}/certificates`, { token: a.token })).status]).toEqual([404, 404]);
      }
      const p = await player(a);
      await t.req('POST', `/people/${p}/disable`, { token: a.token });
      const r = await create(a.token, p, data());
      expect([r.status, r.body.code]).toEqual([409, 'PERSON_DISABLED']);
    });

    it('the certificate does not apply to staff-only people', async () => {
      const a = await context('ce-6@test.it');
      const s = (await t.req('POST', '/people', { token: a.token, body: { name: 'Carlo', email: 'carlo@test.it' } })).body;
      await t.req('POST', `/seasons/${a.seasonId}/enrollments`, { token: a.token, body: { personId: s.id, type: 'staff', staffRoleId: await roleId(t.req, a.token, 'coach') } });
      const r = await create(a.token, s.id, data());
      expect([r.status, r.body.code]).toEqual([409, 'CERTIFICATE_NOT_EXPECTED']);
      // If also a player, it applies.
      await t.req('POST', `/seasons/${a.seasonId}/enrollments`, { token: a.token, body: { personId: s.id, type: 'player' } });
      expect((await create(a.token, s.id, data())).status).toBe(201);
    });

    it('admin only; isolation', async () => {
      const a = await context('ce-7@test.it');
      const p = await player(a);
      await t.req('POST', '/invitations', { token: a.token, body: { email: 'ce-7dir@test.it', role: 'manager' } });
      const u = await t.newUser('ce-7dir@test.it');
      const dir = (await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation('ce-7dir@test.it') } })).body.accessToken;
      expect((await create(dir, p, data())).status).toBe(403);
      expect((await t.req('GET', `/people/${p}/certificates`, { token: dir })).status).toBe(403);
      expect((await t.req('GET', `/people/${p}/certificates`)).status).toBe(401);
    });
  });

  describe('edit and delete', () => {
    it('edits dates and type; audit', async () => {
      const a = await context('ce-8@test.it');
      const p = await player(a);
      const c = (await create(a.token, p, data())).body;
      const r = await t.req('PATCH', `/certificates/${c.id}`, { token: a.token, body: { expiryDate: between(10), type: 'not_competitive' } });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ id: c.id, type: 'not_competitive', expiryDate: between(10), status: 'expiring' });
      expect(await audit('certificate_modified', c.id)).toHaveLength(2);
    });

    it('the edit keeps dates consistent with the values already saved', async () => {
      const a = await context('ce-9@test.it');
      const p = await player(a);
      const c = (await create(a.token, p, data({ issueDate: between(-10), expiryDate: between(100) }))).body;
      const r = await t.req('PATCH', `/certificates/${c.id}`, { token: a.token, body: { expiryDate: between(-20) } });
      expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATE_CERTIFICATE']);
      expect((await t.req('PATCH', `/certificates/${c.id}`, { token: a.token, body: {} })).status).toBe(400);
    });

    it('deletes a certificate and audits it', async () => {
      const a = await context('ce-10@test.it');
      const p = await player(a);
      const c = (await create(a.token, p, data())).body;
      expect((await t.req('DELETE', `/certificates/${c.id}`, { token: a.token })).status).toBe(204);
      expect((await t.req('GET', `/people/${p}/certificates`, { token: a.token })).body).toMatchObject({ status: 'missing', certificates: [] });
      expect(await audit('certificate_modified', c.id)).toHaveLength(2);
      expect((await t.req('DELETE', `/certificates/${c.id}`, { token: a.token })).status).toBe(404);
    });

    it('other club or nonexistent: 404', async () => {
      const a = await context('ce-11a@test.it');
      const b = await context('ce-11b@test.it');
      const c = (await create(a.token, await player(a), data())).body;
      const r = await t.req('PATCH', `/certificates/${c.id}`, { token: b.token, body: { expiryDate: between(5) } });
      expect([r.status, r.body.code]).toEqual([404, 'CERTIFICATE_NOT_FOUND']);
      expect((await t.req('DELETE', `/certificates/${c.id}`, { token: b.token })).status).toBe(404);
    });
  });

  describe('status in roster and record', () => {
    it('the roster shows status and expiry of players; staff has no certificate', async () => {
      const a = await context('ce-12@test.it');
      const p = await player(a, 'Gino');
      const without = await player(a, 'Piero');
      await create(a.token, p, data({ expiryDate: between(10) }));
      const s = (await t.req('POST', '/people', { token: a.token, body: { name: 'Carlo', email: 'carlo12@test.it' } })).body;
      await t.req('POST', `/seasons/${a.seasonId}/enrollments`, { token: a.token, body: { personId: s.id, type: 'staff', staffRoleId: await roleId(t.req, a.token, 'coach') } });

      const roster = (await t.req('GET', `/seasons/${a.seasonId}/roster`, { token: a.token })).body;
      const row = (id: string) => roster.find((r: { personId: string }) => r.personId === id);
      expect(row(p).certificate).toEqual({ status: 'expiring', expiry: between(10) });
      expect(row(without).certificate).toEqual({ status: 'missing', expiry: null });
      expect(row(s.id).certificate).toBeNull();
      // The roster is not an access to the certificate: no read audit row.
      expect(await audit('certificate_read', p)).toHaveLength(0);
    });

    it('the person record reports the status', async () => {
      const a = await context('ce-13@test.it');
      const p = await player(a);
      await create(a.token, p, data({ expiryDate: between(200) }));
      const r = await t.req('GET', `/people/${p}`, { token: a.token });
      expect(r.body.certificate).toEqual({ status: 'valid', expiry: between(200) });
    });
  });
});
