import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AuditLog } from '../src/entities/audit-log.entity';
import { SportProfile } from '../src/entities/sport-profile.entity';
import { Environment, startEnvironment } from './helpers';

const between = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('contenuto riconoscibile del certificato')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);

describe('medical certificates (file and settings)', () => {
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

  async function context(email: string, withFile = true) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    const token = c.body.accessToken as string;
    const clubId = c.body.activeClub.id;
    if (withFile) await t.req('PATCH', '/club/current/settings', { token, body: { certificatesWithFile: true } });
    const act = (await t.req('POST', '/activities', { token, body: { name: 'Football', sportProfile: 'football' } })).body;
    const sq = (await t.req('POST', `/activities/${act.id}/teams`, { token, body: { name: 'Under 15' } })).body;
    const st = (await t.req('POST', `/teams/${sq.id}/seasons`, { token, body: { name: '2026/27', startDate: '2026-09-01', endDate: '2027-06-30' } })).body;
    const p = (await t.req('POST', '/people', { token, body: { name: 'Luca', surname: 'Verdi', birthDate: '2010-03-04', email: `luca-${email}` } })).body;
    await t.req('POST', `/seasons/${st.id}/enrollments`, { token, body: { personId: p.id, type: 'player' } });
    const cert = (await t.req('POST', `/people/${p.id}/certificates`, { token, body: { type: 'competitive', issueDate: between(-10), expiryDate: between(355) } })).body;
    return { token, clubId: clubId as string, personId: p.id as string, certId: cert.id as string };
  }

  const send = (token: string, id: string, data: Buffer, type = 'application/pdf') =>
    t.app.inject({ method: 'PUT', url: `/api/certificates/${id}/file`, headers: { authorization: `Bearer ${token}`, 'content-type': type }, payload: data });
  const download = (token: string, id: string) =>
    t.app.inject({ method: 'GET', url: `/api/certificates/${id}/file`, headers: { authorization: `Bearer ${token}` } });
  const audit = (action: string, entityId: string) => t.orm.em.fork().find(AuditLog, { action: action as never, entityId }, { filters: false });
  const fileOnDisk = async (clubId: string) => readdir(join(t.storageDir, clubId)).catch(() => [] as string[]);

  describe('club settings', () => {
    it('by default the file is not enabled and the block for an expired certificate is', async () => {
      const a = await context('im-1@test.it', false);
      const r = await t.req('GET', '/club/current/settings', { token: a.token });
      expect([r.status, r.body]).toEqual([200, { certificatesWithFile: false, blockCertificateExpired: true }]);
    });

    it('the admin edits them, even one at a time', async () => {
      const a = await context('im-2@test.it', false);
      const r1 = await t.req('PATCH', '/club/current/settings', { token: a.token, body: { certificatesWithFile: true } });
      expect(r1.body).toEqual({ certificatesWithFile: true, blockCertificateExpired: true });
      const r2 = await t.req('PATCH', '/club/current/settings', { token: a.token, body: { blockCertificateExpired: false } });
      expect(r2.body).toEqual({ certificatesWithFile: true, blockCertificateExpired: false });
      expect((await t.req('GET', '/club/current/settings', { token: a.token })).body).toEqual(r2.body);
    });

    it('validation and access: empty or wrong body 400, no token 401, non-admin 403', async () => {
      const a = await context('im-3@test.it', false);
      for (const body of [{}, { certificatesWithFile: 'si' }, { other: true }]) {
        const r = await t.req('PATCH', '/club/current/settings', { token: a.token, body });
        expect([r.status, r.body.code]).toEqual([400, 'INVALID_DATA']);
      }
      expect((await t.req('GET', '/club/current/settings')).status).toBe(401);
      await t.req('POST', '/invitations', { token: a.token, body: { email: 'im-3dir@test.it', role: 'manager' } });
      const u = await t.newUser('im-3dir@test.it');
      const dir = (await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation('im-3dir@test.it') } })).body.accessToken;
      expect((await t.req('GET', '/club/current/settings', { token: dir })).status).toBe(403);
      expect((await t.req('PATCH', '/club/current/settings', { token: dir, body: { certificatesWithFile: true } })).status).toBe(403);
    });

    it('each club has its own', async () => {
      const a = await context('im-4a@test.it', true);
      const b = await context('im-4b@test.it', false);
      expect((await t.req('GET', '/club/current/settings', { token: a.token })).body.certificatesWithFile).toBe(true);
      expect((await t.req('GET', '/club/current/settings', { token: b.token })).body.certificatesWithFile).toBe(false);
    });
  });

  describe('loading', () => {
    it('with the feature off: 409 CERTIFICATE_FILE_NOT_ENABLED and nothing on disk', async () => {
      const a = await context('fi-1@test.it', false);
      const r = await send(a.token, a.certId, PDF);
      expect([r.statusCode, r.json().code]).toEqual([409, 'CERTIFICATE_FILE_NOT_ENABLED']);
      expect(await fileOnDisk(a.clubId)).toHaveLength(0);
    });

    it('uploads a PDF: the certificate shows a file, type from the content, audit without content', async () => {
      const a = await context('fi-2@test.it');
      const r = await send(a.token, a.certId, PDF);
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({ id: a.certId, hasFile: true, fileType: 'application/pdf' });
      expect(JSON.stringify(r.json())).not.toMatch(/fileKey|storageKey/);
      const rows = await audit('certificate_modified', a.certId);
      expect(rows.map((x) => x.meta)).toContainEqual({ operation: 'file_loaded' });
      expect((await t.req('GET', `/people/${a.personId}/certificates`, { token: a.token })).body.certificates[0]).toMatchObject({ hasFile: true });
    });

    it('the file on disk is encrypted', async () => {
      const a = await context('fi-3@test.it');
      await send(a.token, a.certId, PDF);
      const names = await fileOnDisk(a.clubId);
      expect(names).toHaveLength(1);
      const raw = await readFile(join(t.storageDir, a.clubId, names[0]!));
      expect(raw.includes(Buffer.from('contenuto riconoscibile'))).toBe(false);
    });

    it('the type comes from the content: PNG accepted even with a PDF header, HTML rejected even if declared PDF', async () => {
      const a = await context('fi-4@test.it');
      const png = await send(a.token, a.certId, PNG, 'application/pdf');
      expect([png.statusCode, png.json().fileType]).toEqual([200, 'image/png']);
      const html = await send(a.token, a.certId, Buffer.from('<html><script>alert(1)</script></html>'), 'application/pdf');
      expect([html.statusCode, html.json().code]).toEqual([400, 'INVALID_CERTIFICATE_FILE']);
      const empty = await send(a.token, a.certId, Buffer.alloc(0), 'application/pdf');
      expect([empty.statusCode, empty.json().code]).toEqual([400, 'INVALID_CERTIFICATE_FILE']);
    });

    it('over 5 MB: 413 CERTIFICATE_FILE_TOO_BIG, exactly 5 MB passes', async () => {
      const a = await context('fi-5@test.it');
      const limit = 5 * 1024 * 1024;
      const ok = await send(a.token, a.certId, Buffer.concat([PDF, Buffer.alloc(limit - PDF.length)]));
      expect(ok.statusCode).toBe(200);
      const big = await send(a.token, a.certId, Buffer.concat([PDF, Buffer.alloc(limit - PDF.length + 1)]));
      expect([big.statusCode, big.json().code]).toEqual([413, 'CERTIFICATE_FILE_TOO_BIG']);
    });

    it('a second upload replaces the file and deletes the old one from disk', async () => {
      const a = await context('fi-6@test.it');
      await send(a.token, a.certId, PDF);
      const before = await fileOnDisk(a.clubId);
      await send(a.token, a.certId, PNG);
      const after = await fileOnDisk(a.clubId);
      expect(after).toHaveLength(1);
      expect(after[0]).not.toBe(before[0]);
      const r = await download(a.token, a.certId);
      expect(r.rawPayload.equals(PNG)).toBe(true);
    });

    it('nonexistent certificate or from another club: 404; disabled person: 409', async () => {
      const a = await context('fi-7a@test.it');
      const b = await context('fi-7b@test.it');
      for (const id of [a.certId, crypto.randomUUID()]) {
        const r = await send(b.token, id, PDF);
        expect([r.statusCode, r.json().code]).toEqual([404, 'CERTIFICATE_NOT_FOUND']);
      }
      await t.req('POST', `/people/${a.personId}/disable`, { token: a.token });
      const r = await send(a.token, a.certId, PDF);
      expect([r.statusCode, r.json().code]).toEqual([409, 'PERSON_DISABLED']);
    });

    it('admin only', async () => {
      const a = await context('fi-8@test.it');
      await t.req('POST', '/invitations', { token: a.token, body: { email: 'fi-8dir@test.it', role: 'manager' } });
      const u = await t.newUser('fi-8dir@test.it');
      const dir = (await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation('fi-8dir@test.it') } })).body.accessToken;
      expect((await send(dir, a.certId, PDF)).statusCode).toBe(403);
      expect((await download(dir, a.certId)).statusCode).toBe(403);
      expect((await t.app.inject({ method: 'PUT', url: `/api/certificates/${a.certId}/file`, headers: { 'content-type': 'application/pdf' }, payload: PDF })).statusCode).toBe(401);
    });
  });

  describe('reading', () => {
    it('returns the uploaded bytes with headers that prevent caching and sniffing, and audits the access', async () => {
      const a = await context('le-1@test.it');
      await send(a.token, a.certId, PDF);
      const r = await download(a.token, a.certId);
      expect(r.statusCode).toBe(200);
      expect(r.rawPayload.equals(PDF)).toBe(true);
      expect(r.headers['content-type']).toBe('application/pdf');
      expect(r.headers['cache-control']).toContain('no-store');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(await audit('file_certificate_read', a.certId)).toHaveLength(1);
      await download(a.token, a.certId);
      expect(await audit('file_certificate_read', a.certId)).toHaveLength(2);
    });

    it('without a file: 404 CERTIFICATE_FILE_NOT_FOUND and no read audit', async () => {
      const a = await context('le-2@test.it');
      const r = await download(a.token, a.certId);
      expect([r.statusCode, r.json().code]).toEqual([404, 'CERTIFICATE_FILE_NOT_FOUND']);
      expect(await audit('file_certificate_read', a.certId)).toHaveLength(0);
    });

    it('with the feature turned off after upload the file stays readable', async () => {
      const a = await context('le-3@test.it');
      await send(a.token, a.certId, PDF);
      await t.req('PATCH', '/club/current/settings', { token: a.token, body: { certificatesWithFile: false } });
      expect((await download(a.token, a.certId)).statusCode).toBe(200);
      expect((await send(a.token, a.certId, PDF)).statusCode).toBe(409);
    });

    it('another club cannot read it', async () => {
      const a = await context('le-4a@test.it');
      const b = await context('le-4b@test.it');
      await send(a.token, a.certId, PDF);
      expect((await download(b.token, a.certId)).statusCode).toBe(404);
    });
  });

  describe('removal', () => {
    it('DELETE of the file: the certificate stays, the file disappears from disk, audit', async () => {
      const a = await context('ri-1@test.it');
      await send(a.token, a.certId, PDF);
      const r = await t.app.inject({ method: 'DELETE', url: `/api/certificates/${a.certId}/file`, headers: { authorization: `Bearer ${a.token}` } });
      expect(r.statusCode).toBe(204);
      expect(await fileOnDisk(a.clubId)).toHaveLength(0);
      expect((await t.req('GET', `/people/${a.personId}/certificates`, { token: a.token })).body.certificates[0]).toMatchObject({ hasFile: false });
      expect((await audit('certificate_modified', a.certId)).map((x) => x.meta)).toContainEqual({ operation: 'file_deleted' });
      const still = await t.app.inject({ method: 'DELETE', url: `/api/certificates/${a.certId}/file`, headers: { authorization: `Bearer ${a.token}` } });
      expect(still.statusCode).toBe(404);
    });

    it('deleting the certificate also deletes the file', async () => {
      const a = await context('ri-2@test.it');
      await send(a.token, a.certId, PDF);
      expect((await t.req('DELETE', `/certificates/${a.certId}`, { token: a.token })).status).toBe(204);
      expect(await fileOnDisk(a.clubId)).toHaveLength(0);
    });
  });
});
