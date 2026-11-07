import { Person } from '../src/entities/person.entity';
import { AccessRole } from '../src/entities/access-role.entity';
import { Environment, startEnvironment } from './helpers';

describe('clubs and invitations', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
  });
  afterAll(async () => {
    await t?.close();
  });

  /** Creates a user with a club they administer. */
  async function admin(email: string, clubName: string) {
    const s = await t.newUser(email);
    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: clubName, acceptDpa: true } });
    expect(c.status).toBe(201);
    return { token: c.body.accessToken as string, clubId: c.body.activeClub.id as string };
  }

  async function createPerson(clubId: string, email: string) {
    const em = t.orm.em.fork();
    const p = em.create(Person, {
      club: clubId,
      name: 'Gianni',
      surname: 'Bianchi',
      birthDate: '2000-05-01',
      completedAt: new Date(),
      email,
    } as never);
    await em.flush();
    return p.id;
  }

  const accept = (token: string, invitation: string) => t.req('POST', '/invitations/accept', { token, body: { token: invitation } });

  it('isolation between clubs: each sees and touches only its own invitations', async () => {
    const a = await admin('iso-a@test.it', 'Club A');
    const b = await admin('iso-b@test.it', 'Club B');
    const inv = await t.req('POST', '/invitations', { token: a.token, body: { email: 'x@test.it', role: 'manager' } });
    expect(inv.status).toBe(201);

    expect((await t.req('GET', '/invitations', { token: a.token })).body).toHaveLength(1);
    expect((await t.req('GET', '/invitations', { token: b.token })).body).toHaveLength(0);
    expect((await t.req('DELETE', `/invitations/${inv.body.id}`, { token: b.token })).status).toBe(404);
    expect((await t.req('DELETE', `/invitations/${inv.body.id}`, { token: a.token })).status).toBe(204);
  });

  it('closed tenant filter: without a club set the query throws, it does not return everything', async () => {
    await expect(t.orm.em.fork().find(Person, {})).rejects.toThrow(/filter 'tenant'|societaId/);
  });

  it('concurrent requests from different clubs do not mix', async () => {
    const a = await admin('conc-a@test.it', 'Club CA');
    const b = await admin('conc-b@test.it', 'Club CB');
    for (let i = 0; i < 3; i++) await t.req('POST', '/invitations', { token: a.token, body: { email: `ca${i}@test.it`, role: 'manager' } });
    await t.req('POST', '/invitations', { token: b.token, body: { email: 'cb@test.it', role: 'manager' } });
    const responses = await Promise.all(
      Array.from({ length: 40 }, (_, i) => t.req('GET', '/invitations', { token: i % 2 === 0 ? a.token : b.token }).then((r) => [i % 2 === 0 ? 3 : 1, r.body.length])),
    );
    for (const [expected, received] of responses) expect(received).toBe(expected);
  });

  it('a token bound to a club cannot be used on another by changing the sid', async () => {
    const a = await admin('sid-a@test.it', 'Club SA');
    const b = await admin('sid-b@test.it', 'Club SB');
    // B does not belong to A: select-club rejected.
    const r = await t.req('POST', '/auth/select-club', { token: b.token, body: { clubId: a.clubId } });
    expect(r.status).toBe(403);
  });

  it('only admins manage invitations', async () => {
    const a = await admin('admin-only@test.it', 'Club Admin Only');
    await t.req('POST', '/invitations', { token: a.token, body: { email: 'dir@test.it', role: 'manager' } });
    const dir = await t.newUser('dir@test.it');
    const acc = await accept(dir.accessToken, t.tokenInvitation('dir@test.it'));
    expect([acc.status, acc.body]).toEqual([200, expect.anything()]);
    expect((await t.req('POST', '/invitations', { token: acc.body.accessToken, body: { email: 'y@test.it', role: 'manager' } })).status).toBe(403);
  });

  it('scope and person validation', async () => {
    const a = await admin('val@test.it', 'Club Val');
    const post = (body: object) => t.req('POST', '/invitations', { token: a.token, body });
    expect((await post({ email: 'a@test.it', role: 'admin', scope: 'team', teamId: crypto.randomUUID() })).status).toBe(400);
    expect((await post({ email: 'a@test.it', role: 'manager', scope: 'team' })).status).toBe(400);
    expect((await post({ email: 'a@test.it', role: 'manager', scope: 'team', teamId: crypto.randomUUID() })).status).toBe(400);
    expect((await post({ email: 'a@test.it', role: 'player' })).status).toBe(400);
    expect((await post({ email: 'a@test.it', role: 'player', name: 'Gianni', personId: crypto.randomUUID() })).status).toBe(400);
    expect((await post({ email: 'a@test.it', role: 'manager', name: 'Gianni' })).status).toBe(400);
    expect((await post({ email: 'a@test.it', role: 'player', personId: crypto.randomUUID() })).status).toBe(400);
  });

  it('preview: public with the token, without email, identical 404 for every invalid case', async () => {
    const a = await admin('prev@test.it', 'Club Preview');
    const inv = await t.req('POST', '/invitations', { token: a.token, body: { email: 'inv@test.it', role: 'manager' } });
    expect(inv.status).toBe(201);
    const ok = await t.req('GET', `/invitations/preview?token=${t.tokenInvitation('inv@test.it')}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ club: 'Club Preview', role: 'manager', scope: 'club', language: 'it', destination: null, recordName: null });
    expect(JSON.stringify(ok.body)).not.toContain('inv@test.it');

    const fake = await t.req('GET', '/invitations/preview?token=inventato');
    expect(fake.status).toBe(404);
    expect(await t.req('DELETE', `/invitations/${inv.body.id}`, { token: a.token })).toMatchObject({ status: 204 });
    const revoked = await t.req('GET', `/invitations/preview?token=${t.tokenInvitation('inv@test.it')}`);
    expect(revoked.status).toBe(404);
    expect(revoked.body).toEqual(fake.body);
  });

  it('invitation in French: email, preview and language chosen by the inviter', async () => {
    const a = await admin('fr-admin@test.it', 'Club Dakar');
    // Without a language in the body: inherits the inviter's (Italian).
    await t.req('POST', '/invitations', { token: a.token, body: { email: 'it-inv@test.it', role: 'manager' } });
    expect(t.mail.outbox.filter((m) => m.a === 'it-inv@test.it').at(-1)!.subject).toBe('Invito a Club Dakar su TeamManix');

    const fr = await t.req('POST', '/invitations', { token: a.token, body: { email: 'fr-inv@test.it', role: 'manager', language: 'fr' } });
    expect(fr.status).toBe(201);
    expect(fr.body.language).toBe('fr');
    const mail = t.mail.outbox.filter((m) => m.a === 'fr-inv@test.it').at(-1)!;
    expect(mail.subject).toBe('Invitation à Club Dakar sur TeamManix');
    expect(mail.text).toContain('Vous avez reçu une invitation');

    const token = t.tokenFromMail('fr-inv@test.it', 'Invitation');
    const prev = await t.req('GET', `/invitations/preview?token=${token}`);
    expect(prev.body.language).toBe('fr');

    const fake = await t.req('GET', '/invitations/preview?token=inventato');
    expect(fake.status).toBe(404);
    expect(fake.body.code).toBe('INVALID_INVITATION');
    const language = await t.req('POST', '/invitations', { token: a.token, body: { email: 'x@test.it', role: 'manager', language: 'de' } });
    expect(language.status).toBe(400);
  });

  it('acceptance: same outcome for a new and an existing account, generic error in all invalid cases', async () => {
    const a = await admin('inv-a@test.it', 'Club Invitations');
    const b = await admin('inv-b@test.it', 'Club Other');

    // New account: the invitation goes out before registration.
    const inv1 = await t.req('POST', '/invitations', { token: a.token, body: { email: 'new@test.it', role: 'manager' } });
    // Existing account, already in another club.
    const existing = await t.newUser('existing@test.it');
    await t.req('POST', '/club', { token: existing.accessToken, body: { name: 'Own club', acceptDpa: true } });
    const inv2 = await t.req('POST', '/invitations', { token: a.token, body: { email: 'existing@test.it', role: 'manager' } });
    expect(Object.keys(inv2.body).sort()).toEqual(Object.keys(inv1.body).sort());
    const existingToken = t.tokenInvitation('existing@test.it');
    const newToken = t.tokenInvitation('new@test.it');
    // The mail does not change with the account's existence (same structure, no hint).
    const body = (a: string) => t.mail.outbox.filter((m) => m.a === a).at(-1)!.text.replace(/token=\S+/, 'token=#');
    expect(body('existing@test.it')).toBe(body('new@test.it'));

    const fresh = await t.newUser('new@test.it');
    const r1 = await accept(fresh.accessToken, newToken);
    const login = await t.req('POST', '/auth/login', { body: { email: 'existing@test.it', password: 'password-long-123' } });
    const r2 = await accept(login.body.accessToken, existingToken);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.activeClub.name).toBe('Club Invitations');
    expect(r2.body.activeClub.name).toBe('Club Invitations');
    expect(r2.body.memberships.map((x: { name: string }) => x.name).sort()).toEqual(['Club Invitations', 'Own club']);

    // Reuse of the same token, made-up token, different email, revoked: identical response.
    const reuse = await accept(fresh.accessToken, newToken);
    const fake = await accept(fresh.accessToken, 'made-up-token');
    const other = await t.newUser('other@test.it');
    const invOther = await t.req('POST', '/invitations', { token: b.token, body: { email: 'third@test.it', role: 'manager' } });
    const differentEmail = await accept(other.accessToken, t.tokenInvitation('third@test.it'));
    await t.req('DELETE', `/invitations/${invOther.body.id}`, { token: b.token });
    const third = await t.newUser('third@test.it');
    const revoked = await accept(third.accessToken, t.tokenInvitation('third@test.it'));
    for (const r of [reuse, fake, differentEmail, revoked]) {
      expect(r.status).toBe(404);
      expect(r.body).toEqual(reuse.body);
    }
    expect(reuse.body.code).toBe('INVALID_INVITATION');
  });

  it('expired invitation: generic error', async () => {
    const a = await admin('scad@test.it', 'Club Scad');
    await t.req('POST', '/invitations', { token: a.token, body: { email: 'late@test.it', role: 'manager' } });
    await t.orm.em.fork().nativeUpdate('Invitation', { email: 'late@test.it' }, { expiresAt: new Date(Date.now() - 1000) }, { filters: false });
    const u = await t.newUser('late@test.it');
    const r = await accept(u.accessToken, t.tokenInvitation('late@test.it'));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('INVALID_INVITATION');
  });

  it('player invitation links the account to the record; an account does not link two records in the same club', async () => {
    const a = await admin('gio-a@test.it', 'Club Gio');
    const p1 = await createPerson(a.clubId, 'gio@test.it');
    const p2 = await createPerson(a.clubId, 'gio@test.it');
    await t.req('POST', '/invitations', { token: a.token, body: { email: 'gio@test.it', role: 'player', personId: p1 } });
    const inv2 = await t.req('POST', '/invitations', { token: a.token, body: { email: 'gio@test.it', role: 'player', personId: p2 } });
    expect(inv2.status).toBe(201);
    const mails = t.mail.outbox.filter((m) => m.a === 'gio@test.it' && m.subject.startsWith('Invito'));
    const [tok1, tok2] = mails.map((m) => /token=(\S+)/.exec(m.text)![1]!);

    const g = await t.newUser('gio@test.it');
    const ok = await accept(g.accessToken, tok1!);
    expect(ok.status).toBe(200);
    const em = t.orm.em.fork();
    expect((await em.findOneOrFail(Person, p1, { filters: false })).user?.id).toBeDefined();
    // Second record in the same club: rejected, stays free.
    const double = await accept(ok.body.accessToken, tok2!);
    expect(double.status).toBe(409);
    expect((await t.orm.em.fork().findOneOrFail(Person, p2, { filters: false })).user).toBeNull();
  });

  it('invitation with only name and email: the athlete completes the record', async () => {
    const a = await admin('min-a@test.it', 'Club Min');
    const inv = await t.req('POST', '/invitations', { token: a.token, body: { email: 'athlete@test.it', role: 'player', name: 'Luca' } });
    expect(inv.status).toBe(201);
    expect(inv.body.personId).toBeDefined();

    const u = await t.newUser('athlete@test.it');
    const ok = await accept(u.accessToken, t.tokenInvitation('athlete@test.it'));
    expect(ok.status).toBe(200);
    expect(ok.body.memberships[0]).toMatchObject({ linkedToPerson: true, recordToComplete: true });

    const token = ok.body.accessToken;
    const before = await t.req('GET', '/people/me', { token });
    expect(before.body).toMatchObject({ name: 'Luca', surname: null, birthDate: null, email: 'athlete@test.it', toComplete: true });

    const patch = (body: object) => t.req('PATCH', '/people/me', { token, body });
    expect((await patch({ surname: 'Verdi', birthDate: '2030-01-01' })).status).toBe(400); // future
    expect((await patch({ surname: 'Verdi', birthDate: '2001-02-30' })).status).toBe(400); // nonexistent
    expect((await patch({ surname: 'Verdi' })).status).toBe(400);
    const complete = await patch({ surname: 'Verdi', birthDate: '2001-02-03', phone: '3331234567' });
    expect(complete.status).toBe(200);
    expect(complete.body).toMatchObject({ surname: 'Verdi', birthDate: '2001-02-03', toComplete: false });

    const l = await t.req('POST', '/auth/login', { body: { email: 'athlete@test.it', password: 'password-long-123' } });
    expect(l.body.memberships[0].recordToComplete).toBe(false);
  });

  it('whoever has no record has no /people/me', async () => {
    const a = await admin('nosc@test.it', 'Club NoSc');
    expect((await t.req('GET', '/people/me', { token: a.token })).status).toBe(404);
  });

  it('detach: record stays with the club, account out immediately, old token rejected', async () => {
    const a = await admin('dis-a@test.it', 'Club Dis');
    const p = await createPerson(a.clubId, 'dis@test.it');
    await t.req('POST', '/invitations', { token: a.token, body: { email: 'dis@test.it', role: 'player', personId: p } });
    const g = await t.newUser('dis@test.it');
    const ok = await accept(g.accessToken, t.tokenInvitation('dis@test.it'));
    expect((await t.req('GET', '/invitations', { token: ok.body.accessToken })).status).toBe(403); // not admin

    const d = await t.req('POST', '/club/current/detachment', { token: ok.body.accessToken });
    expect(d.status).toBe(200);
    expect(d.body.activeClub).toBeNull();
    expect(d.body.memberships).toEqual([]);
    // The token bound to the club is no longer valid, immediately and not at expiry.
    const old = await t.req('POST', '/club/current/detachment', { token: ok.body.accessToken });
    expect(old.status).toBe(403);
    expect(old.body.code).toBe('CLUB_NOT_ACCESSIBLE');
    // The record stays, unlinked.
    const person = await t.orm.em.fork().findOneOrFail(Person, p, { filters: false });
    expect(person.user).toBeNull();
    // Can rejoin with a new invitation.
    expect((await t.req('GET', '/auth/me', { token: d.body.accessToken })).status).toBe(200);
  });

  it('detach: the last admin cannot leave, with two admins yes', async () => {
    const a = await admin('last-a@test.it', 'Club Last');
    const blocked = await t.req('POST', '/club/current/detachment', { token: a.token });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('LAST_ADMIN');

    await t.req('POST', '/invitations', { token: a.token, body: { email: 'last-b@test.it', role: 'admin' } });
    const b = await t.newUser('last-b@test.it');
    expect((await accept(b.accessToken, t.tokenInvitation('last-b@test.it'))).status).toBe(200);
    expect((await t.req('POST', '/club/current/detachment', { token: a.token })).status).toBe(200);
    const roles = await t.orm.em.fork().find(AccessRole, { club: a.clubId }, { filters: false });
    expect(roles).toHaveLength(1);
  });

  it('multiple clubs: login without a choice, then selection', async () => {
    const a = await admin('multi-a@test.it', 'Club One');
    await t.req('POST', '/invitations', { token: a.token, body: { email: 'multi-b@test.it', role: 'manager' } });
    const m = await t.newUser('multi-b@test.it');
    await t.req('POST', '/club', { token: m.accessToken, body: { name: 'Club Two', acceptDpa: true } });
    await accept((await t.req('POST', '/auth/login', { body: { email: 'multi-b@test.it', password: 'password-long-123' } })).body.accessToken, t.tokenInvitation('multi-b@test.it'));

    const l = await t.req('POST', '/auth/login', { body: { email: 'multi-b@test.it', password: 'password-long-123' } });
    expect(l.body.activeClub).toBeNull();
    expect(l.body.memberships).toHaveLength(2);
    // Without an active club the club routes say to choose one.
    const without = await t.req('GET', '/invitations', { token: l.body.accessToken });
    expect(without.status).toBe(403);
    expect(without.body.code).toBe('CLUB_NOT_SELECTED');
    const sel = await t.req('POST', '/auth/select-club', { token: l.body.accessToken, body: { clubId: a.clubId } });
    expect(sel.status).toBe(200);
    expect(sel.body.activeClub.name).toBe('Club One');
  });
});
