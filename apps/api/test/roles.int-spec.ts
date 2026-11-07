import { AuditLog } from '../src/entities/audit-log.entity';
import { Person } from '../src/entities/person.entity';
import { Environment, startEnvironment } from './helpers';

describe('invitations (resend) and access roles', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
  });
  afterAll(async () => {
    await t?.close();
  });

  async function admin(email: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    return { token: c.body.accessToken as string, clubId: c.body.activeClub.id as string, userId: s.user.id as string };
  }

  /** Invites `email` with the given role and has it accepted: returns the token valid in the club. */
  async function withRole(a: { token: string }, email: string, role: 'admin' | 'manager') {
    const inv = await t.req('POST', '/invitations', { token: a.token, body: { email, role } });
    expect(inv.status).toBe(201);
    const u = await t.newUser(email);
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
    expect(acc.status).toBe(200);
    return { token: acc.body.accessToken as string, userId: u.user.id as string };
  }

  const audit = (action: string, entityId: string) =>
    t.orm.em.fork().find(AuditLog, { action: action as never, entityId }, { filters: false });
  const preview = (token: string) => t.req('GET', `/invitations/preview?token=${token}`);

  describe('invitation resend', () => {
    it('generates a new link, invalidates the old one and renews the expiry', async () => {
      const a = await admin('rei-1@test.it');
      const inv = await t.req('POST', '/invitations', { token: a.token, body: { email: 'dest@test.it', role: 'manager' } });
      const old = t.tokenInvitation('dest@test.it');
      await t.orm.em.fork().nativeUpdate('Invitation', { id: inv.body.id }, { expiresAt: new Date(Date.now() + 1000) }, { filters: false });

      const r = await t.req('POST', `/invitations/${inv.body.id}/resend`, { token: a.token });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ id: inv.body.id, email: 'dest@test.it', status: 'sent' });
      expect(new Date(r.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 86_400_000);

      const fresh = t.tokenInvitation('dest@test.it');
      expect(fresh).not.toBe(old);
      expect((await preview(old)).status).toBe(404);
      expect((await preview(fresh)).status).toBe(200);
      expect(await audit('invitation_resent', inv.body.id)).toHaveLength(1);
    });

    it('an expired invitation can be resent and then accepted', async () => {
      const a = await admin('rei-2@test.it');
      const inv = await t.req('POST', '/invitations', { token: a.token, body: { email: 'late@test.it', role: 'manager' } });
      await t.orm.em.fork().nativeUpdate('Invitation', { id: inv.body.id }, { expiresAt: new Date(Date.now() - 1000) }, { filters: false });
      expect((await preview(t.tokenInvitation('late@test.it'))).status).toBe(404);

      expect((await t.req('POST', `/invitations/${inv.body.id}/resend`, { token: a.token })).status).toBe(200);
      const u = await t.newUser('late@test.it');
      const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation('late@test.it') } });
      expect(acc.status).toBe(200);
    });

    it('the mail goes out in the invitation language', async () => {
      const a = await admin('rei-3@test.it');
      const inv = await t.req('POST', '/invitations', { token: a.token, body: { email: 'fr@test.it', role: 'manager', language: 'fr' } });
      const before = t.mail.outbox.filter((m) => m.a === 'fr@test.it').length;
      await t.req('POST', `/invitations/${inv.body.id}/resend`, { token: a.token });
      const mail = t.mail.outbox.filter((m) => m.a === 'fr@test.it');
      expect(mail).toHaveLength(before + 1);
      expect(mail.at(-1)!.subject.startsWith('Invitation')).toBe(true);
    });

    it('only still open invitations: accepted or revoked give 404', async () => {
      const a = await admin('rei-4@test.it');
      const revoked = await t.req('POST', '/invitations', { token: a.token, body: { email: 'rev@test.it', role: 'manager' } });
      await t.req('DELETE', `/invitations/${revoked.body.id}`, { token: a.token });
      const r = await t.req('POST', `/invitations/${revoked.body.id}/resend`, { token: a.token });
      expect(r.status).toBe(404);
      expect(r.body.code).toBe('INVITATION_NOT_FOUND');

      const accepted = await t.req('POST', '/invitations', { token: a.token, body: { email: 'acc@test.it', role: 'manager' } });
      const u = await t.newUser('acc@test.it');
      await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation('acc@test.it') } });
      expect((await t.req('POST', `/invitations/${accepted.body.id}/resend`, { token: a.token })).status).toBe(404);
    });

    it('isolation and permissions: another club cannot touch it, nor can a manager', async () => {
      const a = await admin('rei-5a@test.it');
      const b = await admin('rei-5b@test.it');
      const inv = await t.req('POST', '/invitations', { token: a.token, body: { email: 'x@test.it', role: 'manager' } });
      expect((await t.req('POST', `/invitations/${inv.body.id}/resend`, { token: b.token })).status).toBe(404);
      const dir = await withRole(a, 'dir-rei@test.it', 'manager');
      expect((await t.req('POST', `/invitations/${inv.body.id}/resend`, { token: dir.token })).status).toBe(403);
    });

    it('record disabled in the meantime: 409 PERSON_DISABLED', async () => {
      const a = await admin('rei-6@test.it');
      const em = t.orm.em.fork();
      const p = em.create(Person, { club: a.clubId, name: 'Gianni', email: 'gio@test.it' } as never);
      await em.flush();
      const inv = await t.req('POST', '/invitations', { token: a.token, body: { email: 'gio@test.it', role: 'player', personId: p.id } });
      expect(inv.status).toBe(201);
      await t.orm.em.fork().nativeUpdate('Person', { id: p.id }, { disabledAt: new Date() }, { filters: false });
      const r = await t.req('POST', `/invitations/${inv.body.id}/resend`, { token: a.token });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('PERSON_DISABLED');
    });
  });

  describe('access roles', () => {
    it('lists the club roles with the account data', async () => {
      const a = await admin('ruo-1@test.it');
      const dir = await withRole(a, 'ruo-dir@test.it', 'manager');
      const r = await t.req('GET', '/roles', { token: a.token });
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(2);
      const d = r.body.find((x: { userId: string }) => x.userId === dir.userId);
      expect(d).toMatchObject({
        role: 'manager',
        scope: 'club',
        email: 'ruo-dir@test.it',
        name: 'Mario',
        surname: 'Rossi',
        activityId: null,
        teamId: null,
        destination: null,
      });
      expect(d.id).toEqual(expect.any(String));
      expect(r.body.find((x: { userId: string }) => x.userId === a.userId)).toMatchObject({ role: 'admin' });
    });

    it('isolation and permissions', async () => {
      const a = await admin('ruo-2a@test.it');
      const b = await admin('ruo-2b@test.it');
      expect((await t.req('GET', '/roles', { token: b.token })).body).toHaveLength(1);
      const dir = await withRole(a, 'ruo-2dir@test.it', 'manager');
      expect((await t.req('GET', '/roles', { token: dir.token })).status).toBe(403);
      expect((await t.req('GET', '/roles')).status).toBe(401);
    });

    it('removes a role: the account loses access immediately and the action is audited', async () => {
      const a = await admin('ruo-3@test.it');
      const dir = await withRole(a, 'ruo-3dir@test.it', 'manager');
      const roles = (await t.req('GET', '/roles', { token: a.token })).body;
      const its = roles.find((x: { userId: string }) => x.userId === dir.userId);
      expect((await t.req('GET', '/invitations', { token: dir.token })).body.code).toBe('ADMIN_ONLY');

      const r = await t.req('DELETE', `/roles/${its.id}`, { token: a.token });
      expect(r.status).toBe(204);
      // Same token: the club is no longer accessible.
      const after = await t.req('GET', '/invitations', { token: dir.token });
      expect([after.status, after.body.code]).toEqual([403, 'CLUB_NOT_ACCESSIBLE']);
      expect((await t.req('GET', '/roles', { token: a.token })).body).toHaveLength(1);
      expect(await audit('role_removed', its.id)).toHaveLength(1);
    });

    it('the last admin cannot be removed, with more admins yes', async () => {
      const a = await admin('ruo-4@test.it');
      const my = (await t.req('GET', '/roles', { token: a.token })).body[0];
      const r = await t.req('DELETE', `/roles/${my.id}`, { token: a.token });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('LAST_ADMIN');

      const second = await withRole(a, 'ruo-4b@test.it', 'admin');
      expect((await t.req('DELETE', `/roles/${my.id}`, { token: second.token })).status).toBe(204);
      // Now the second is the last.
      const remaining = (await t.req('GET', '/roles', { token: second.token })).body[0];
      expect((await t.req('DELETE', `/roles/${remaining.id}`, { token: second.token })).status).toBe(409);
    });

    it('two admins removing each other together: one remains', async () => {
      const a = await admin('ruo-5@test.it');
      const b = await withRole(a, 'ruo-5b@test.it', 'admin');
      const roles = (await t.req('GET', '/roles', { token: a.token })).body;
      const [ra, rb] = [a.userId, b.userId].map((u) => roles.find((x: { userId: string }) => x.userId === u).id);
      const outcomes = await Promise.all([
        t.req('DELETE', `/roles/${rb}`, { token: a.token }),
        t.req('DELETE', `/roles/${ra}`, { token: b.token }),
      ]);
      expect(outcomes.map((e) => e.status).sort()).toEqual([204, 409]);
    });

    it('role of another club or nonexistent: 404', async () => {
      const a = await admin('ruo-6a@test.it');
      const b = await admin('ruo-6b@test.it');
      const its = (await t.req('GET', '/roles', { token: a.token })).body[0];
      const r = await t.req('DELETE', `/roles/${its.id}`, { token: b.token });
      expect(r.status).toBe(404);
      expect(r.body.code).toBe('ROLE_NOT_FOUND');
      expect((await t.req('DELETE', `/roles/${crypto.randomUUID()}`, { token: a.token })).status).toBe(404);
    });

    it('removing a role does not touch the linked person record', async () => {
      const a = await admin('ruo-7@test.it');
      const dir = await withRole(a, 'ruo-7dir@test.it', 'manager');
      const em = t.orm.em.fork();
      const p = em.create(Person, { club: a.clubId, name: 'Dir', email: 'ruo-7dir@test.it', user: dir.userId } as never);
      await em.flush();
      const its = (await t.req('GET', '/roles', { token: a.token })).body.find((x: { userId: string }) => x.userId === dir.userId);
      expect((await t.req('DELETE', `/roles/${its.id}`, { token: a.token })).status).toBe(204);
      const p2 = await t.orm.em.fork().findOne(Person, p.id, { filters: false });
      expect(p2?.user?.id).toBe(dir.userId);
    });
  });
});
