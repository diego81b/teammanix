import { AuditLog } from '../src/entities/audit-log.entity';
import { Membership } from '../src/entities/membership.entity';
import { Notification } from '../src/entities/notification.entity';
import { NotificationPreference } from '../src/entities/notification-preference.entity';
import { NotificationType } from '../src/entities/enums';
import { Person } from '../src/entities/person.entity';
import { PushSubscription } from '../src/entities/push-subscription.entity';
import { TermsAcceptance } from '../src/entities/terms-acceptance.entity';
import { User } from '../src/entities/user.entity';
import { AccessRole } from '../src/entities/access-role.entity';
import { Invitation } from '../src/entities/invitation.entity';
import { Environment, PASSWORD, startEnvironment } from './helpers';

describe('delete own account (art. 17)', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
  });
  afterAll(async () => {
    await t?.close();
  });

  const remove = (token: string, password: string = PASSWORD) => t.req('POST', '/auth/delete-account', { token, body: { password } });
  const code = (r: { status: number; body: { code?: string } }) => [r.status, r.body?.code];

  async function admin(email: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: `Club ${email}`, acceptDpa: true } });
    expect(c.status).toBe(201);
    return { token: c.body.accessToken as string, clubId: c.body.activeClub.id as string, userId: s.user.id as string };
  }

  /** Invites `email` as admin or manager and has it accepted. */
  async function withRole(a: { token: string }, email: string, role: 'admin' | 'manager') {
    const inv = await t.req('POST', '/invitations', { token: a.token, body: { email, role } });
    expect(inv.status).toBe(201);
    const u = await t.newUser(email);
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
    expect(acc.status).toBe(200);
    return { token: acc.body.accessToken as string, userId: u.user.id as string, clubId: acc.body.activeClub.id as string };
  }

  /** A person record with an email, invited as player and accepted: the account is linked to the record. */
  async function asPlayer(a: { token: string }, email: string, name = 'Pia') {
    const p = await t.req('POST', '/people', { token: a.token, body: { name, surname: 'Verdi', birthDate: '2000-01-01', email } });
    expect(p.status).toBe(201);
    const inv = await t.req('POST', '/invitations', { token: a.token, body: { email, role: 'player', personId: p.body.id } });
    expect(inv.status).toBe(201);
    const u = await t.newUser(email, name);
    const acc = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation(email) } });
    expect(acc.status).toBe(200);
    return { token: acc.body.accessToken as string, userId: u.user.id as string, personId: p.body.id as string };
  }

  const em = () => t.orm.em.fork();
  const userExists = async (id: string) => (await em().count(User, { id })) === 1;
  const audits = (userClubId: string) => em().find(AuditLog, { action: 'account_deleted' as never, club: userClubId }, { filters: false });

  it('with the right password the account is gone: login fails, the old token gets 401, personal data is deleted', async () => {
    const a = await admin('del-1@test.it');
    const m = await withRole(a, 'del-1m@test.it', 'manager');
    const f = em();
    f.create(PushSubscription, { user: f.getReference(User, m.userId), endpoint: 'https://push.test/1', p256dh: 'k', auth: 'a' });
    f.create(NotificationPreference, { user: f.getReference(User, m.userId), club: m.clubId as never, inApp: true, email: true, push: false });
    f.create(Notification, { club: m.clubId, user: f.getReference(User, m.userId), type: NotificationType.CALLUP, params: {} } as never);
    await f.flush();

    const r = await remove(m.token);
    expect(r.status).toBe(204);

    expect(await userExists(m.userId)).toBe(false);
    expect([(await t.req('POST', '/auth/login', { body: { email: 'del-1m@test.it', password: PASSWORD } })).status]).toEqual([401]);
    expect(code(await t.req('GET', '/auth/me', { token: m.token }))).toEqual([401, 'INVALID_TOKEN']);
    const check = em();
    expect(await check.count(PushSubscription, { user: m.userId })).toBe(0);
    expect(await check.count(NotificationPreference, { user: m.userId })).toBe(0);
    expect(await check.count(Notification, { user: m.userId }, { filters: false })).toBe(0);
    expect(await check.count(TermsAcceptance, { user: m.userId })).toBe(0); // the proof stays, but no longer linked
    expect(await check.count(AccessRole, { user: m.userId }, { filters: false })).toBe(0);
    expect(await check.count(Membership, { user: m.userId }, { filters: false })).toBe(0);
    // The club keeps working for whoever is left.
    expect((await t.req('GET', '/roles', { token: a.token })).body).toHaveLength(1);
  });

  it('a wrong or missing password is refused and nothing is deleted', async () => {
    const a = await admin('del-2@test.it');
    const m = await withRole(a, 'del-2m@test.it', 'manager');

    expect(code(await remove(m.token, 'not-the-password'))).toEqual([401, 'PASSWORD_CURRENT_WRONG']);
    expect(code(await t.req('POST', '/auth/delete-account', { token: m.token, body: {} }))).toEqual([400, 'INVALID_DATA']);
    expect(code(await t.req('POST', '/auth/delete-account', { body: { password: PASSWORD } }))).toEqual([401, 'AUTHENTICATION_REQUIRED']);

    expect(await userExists(m.userId)).toBe(true);
    expect((await t.req('GET', '/auth/me', { token: m.token })).status).toBe(200);
  });

  it('the last admin of a club cannot delete the account until another admin exists', async () => {
    const a = await admin('del-3@test.it');
    expect(code(await remove(a.token))).toEqual([409, 'LAST_ADMIN']);
    expect(await userExists(a.userId)).toBe(true);

    const second = await withRole(a, 'del-3b@test.it', 'admin');
    expect((await remove(a.token)).status).toBe(204);
    expect(await userExists(a.userId)).toBe(false);
    // The second admin is now the last one.
    expect(code(await remove(second.token))).toEqual([409, 'LAST_ADMIN']);
  });

  it('all or nothing: sole admin in one club blocks the deletion even if the other club is fine', async () => {
    const a = await admin('del-4@test.it');
    const b = await admin('del-4b@test.it');
    const manager = await withRole(b, 'del-4m@test.it', 'manager');
    // del-4m is manager of b's club; make them sole admin of a second club of their own.
    const own = await t.req('POST', '/club', { token: manager.token, body: { name: 'Own club', acceptDpa: true } });
    expect(own.status).toBe(201);

    expect(code(await remove(own.body.accessToken))).toEqual([409, 'LAST_ADMIN']);
    expect(await userExists(manager.userId)).toBe(true);
    expect(await em().count(AccessRole, { user: manager.userId }, { filters: false })).toBe(2);
    expect(await audits(b.clubId)).toHaveLength(0);
    void a;
  });

  it('the person record stays with the club, unlinked from the account; roles and policy are removed', async () => {
    const a = await admin('del-5@test.it');
    const p = await asPlayer(a, 'del-5p@test.it');
    const before = (await t.req('GET', `/people/${p.personId}`, { token: a.token })).body;

    expect((await remove(p.token)).status).toBe(204);

    const after = await t.req('GET', `/people/${p.personId}`, { token: a.token });
    expect(after.status).toBe(200);
    expect(after.body).toEqual(before);
    const person = await em().findOneOrFail(Person, { id: p.personId }, { filters: false });
    expect(person.user).toBeNull();
    expect(person.name).toBe('Pia');
    expect(await userExists(p.userId)).toBe(false);
  });

  it('is audited in every club of the account, without personal data', async () => {
    const a = await admin('del-6@test.it');
    const b = await admin('del-6b@test.it');
    const p = await asPlayer(a, 'del-6p@test.it');
    // The same account is also a manager in a second club.
    const inv = await t.req('POST', '/invitations', { token: b.token, body: { email: 'del-6p@test.it', role: 'manager' } });
    expect(inv.status).toBe(201);
    const login = await t.req('POST', '/auth/login', { body: { email: 'del-6p@test.it', password: PASSWORD } });
    const acc = await t.req('POST', '/invitations/accept', { token: login.body.accessToken, body: { token: t.tokenInvitation('del-6p@test.it') } });
    expect(acc.status).toBe(200);

    expect((await remove(acc.body.accessToken)).status).toBe(204);

    const inA = await audits(a.clubId);
    const inB = await audits(b.clubId);
    expect([inA.length, inB.length]).toEqual([1, 1]);
    expect(inA[0]).toMatchObject({ entity: 'Person', entityId: p.personId });
    for (const row of [...inA, ...inB]) {
      expect(row.user).toBeNull();
      const text = JSON.stringify({ meta: row.meta, entity: row.entity });
      expect(text).not.toMatch(/del-6p|Pia|Verdi/);
    }
  });

  it('the proof of acceptance stays as evidence: frozen signer, unlinked from the account, club kept', async () => {
    const a = await admin('del-8@test.it');
    await withRole(a, 'del-8b@test.it', 'admin');
    const before = await em().find(TermsAcceptance, { user: a.userId }, { orderBy: { type: 'asc' } });
    expect(before.map((r) => r.type)).toEqual(['dpa', 'privacy', 'terms']);
    // The signer is the person at the moment of the signature, not what the account says later.
    await em().nativeUpdate(User, { id: a.userId }, { name: 'Changed' });

    expect((await remove(a.token)).status).toBe(204);

    const kept = await em().find(TermsAcceptance, { signerEmail: 'del-8@test.it' }, { orderBy: { type: 'asc' }, filters: false });
    expect(kept.map((r) => [r.type, r.version, r.acceptedAt.getTime()])).toEqual(
      before.map((r) => [r.type, r.version, r.acceptedAt.getTime()]),
    );
    for (const r of kept) {
      expect(r.user).toBeNull();
      expect(r.signerName).toBe('Mario Rossi');
    }
    expect(kept.find((r) => r.type === 'dpa')?.club?.id).toBe(a.clubId);
    expect(kept.find((r) => r.type === 'terms')?.club).toBeNull();
  });

  it('invitations sent by the deleted account stay valid', async () => {
    const a = await admin('del-7@test.it');
    const second = await withRole(a, 'del-7b@test.it', 'admin');
    const inv = await t.req('POST', '/invitations', { token: second.token, body: { email: 'del-7x@test.it', role: 'manager' } });
    expect(inv.status).toBe(201);

    expect((await remove(second.token)).status).toBe(204);

    const row = await em().findOneOrFail(Invitation, { id: inv.body.id }, { filters: false });
    expect(row.invitedBy).toBeNull();
    expect((await t.req('GET', '/invitations', { token: a.token })).body.some((i: { id: string }) => i.id === inv.body.id)).toBe(true);
    const u = await t.newUser('del-7x@test.it');
    const accepted = await t.req('POST', '/invitations/accept', { token: u.accessToken, body: { token: t.tokenInvitation('del-7x@test.it') } });
    expect(accepted.status).toBe(200);
  });
});
