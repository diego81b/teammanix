import { Environment, startEnvironment, PASSWORD } from './helpers';

describe('auth', () => {
  let t: Environment;
  beforeAll(async () => {
    t = await startEnvironment();
  });
  afterAll(async () => {
    await t?.close();
  });

  it('health is public', async () => {
    const r = await t.req('GET', '/health');
    expect(r.status).toBe(200);
  });

  it('protected routes without a token: 401', async () => {
    expect((await t.req('GET', '/invitations')).status).toBe(401);
    expect((await t.req('GET', '/auth/me')).status).toBe(401);
    expect((await t.req('GET', '/auth/me', { token: 'not.a.jwt' })).status).toBe(401);
  });

  it('registration responds the same for a new and an existing email, revealing nothing', async () => {
    const fresh = await t.req('POST', '/auth/registration', {
      body: { email: 'anti@test.it', password: PASSWORD, name: 'A', surname: 'B', acceptTerms: true },
    });
    await t.req('POST', '/auth/verify-email', { body: { token: t.tokenFromMail('anti@test.it') } });
    const existing = await t.req('POST', '/auth/registration', {
      body: { email: 'anti@test.it', password: PASSWORD, name: 'A', surname: 'B', acceptTerms: true },
    });
    expect(fresh.status).toBe(202);
    expect(existing.status).toBe(202);
    expect(existing.body).toEqual(fresh.body);
    // The owner gets a different mail: verification the first time, the notice the second.
    const mail = t.mail.outbox.filter((m) => m.a === 'anti@test.it').map((m) => m.subject);
    expect(mail).toEqual(['TeamManix: conferma la tua email', 'TeamManix: hai già un account']);
  });

  describe('repeated registration on a never-verified account', () => {
    const base = { surname: 'B', acceptTerms: true };
    const register = (email: string, extra: object) => t.req('POST', '/auth/registration', { body: { ...base, email, ...extra } });

    it('overwrites password and data, responds as usual and resends the verification', async () => {
      const before = await register('sov@test.it', { password: PASSWORD, name: 'Old' });
      const second = await register('sov@test.it', { password: 'new-password-123', name: 'New' });
      expect(second.status).toBe(202);
      expect(second.body).toEqual(before.body);
      // Two verification mails, no "you already have an account" notice.
      const mail = t.mail.outbox.filter((m) => m.a === 'sov@test.it').map((m) => m.subject);
      expect(mail).toEqual(['TeamManix: conferma la tua email', 'TeamManix: conferma la tua email']);

      expect((await t.req('POST', '/auth/verify-email', { body: { token: t.tokenFromMail('sov@test.it') } })).status).toBe(200);
      expect((await t.req('POST', '/auth/login', { body: { email: 'sov@test.it', password: PASSWORD } })).status).toBe(401);
      const login = await t.req('POST', '/auth/login', { body: { email: 'sov@test.it', password: 'new-password-123' } });
      expect(login.status).toBe(200);
      expect(login.body.user.name).toBe('New');
      expect(await t.orm.em.fork().count('User', { email: 'sov@test.it' })).toBe(1);
    });

    it('the link from the previous registration is no longer valid', async () => {
      await register('old@test.it', { password: PASSWORD, name: 'A' });
      const linkOld = t.tokenFromMail('old@test.it');
      await register('old@test.it', { password: 'new-password-123', name: 'A' });
      const r = await t.req('POST', '/auth/verify-email', { body: { token: linkOld } });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('INVALID_LINK');
      expect((await t.req('POST', '/auth/login', { body: { email: 'old@test.it', password: 'new-password-123' } })).status).toBe(403);
    });

    it('the language is the one from the last request', async () => {
      await register('language-sov@test.it', { password: PASSWORD, name: 'A', language: 'it' });
      await register('language-sov@test.it', { password: PASSWORD, name: 'A', language: 'fr' });
      const last = [...t.mail.outbox].reverse().find((m) => m.a === 'language-sov@test.it');
      expect(last?.subject).toBe('TeamManix : confirmez votre adresse e-mail');
      expect(await t.orm.em.fork().findOneOrFail('User', { email: 'language-sov@test.it' })).toMatchObject({ language: 'fr' });
    });

    it('terms and privacy acceptances are recorded again', async () => {
      await register('terms-sov@test.it', { password: PASSWORD, name: 'A' });
      await register('terms-sov@test.it', { password: PASSWORD, name: 'A' });
      expect(await t.orm.em.fork().count('TermsAcceptance', { user: { email: 'terms-sov@test.it' } })).toBe(4);
    });

    it('already verified account: nothing changes, only the notice arrives', async () => {
      await t.newUser('verified@test.it', 'Original');
      const r = await register('verified@test.it', { password: 'new-password-123', name: 'Intruso' });
      expect(r.status).toBe(202);
      expect(t.mail.outbox.filter((m) => m.a === 'verified@test.it').at(-1)?.subject).toBe('TeamManix: hai già un account');
      const login = await t.req('POST', '/auth/login', { body: { email: 'verified@test.it', password: PASSWORD } });
      expect(login.status).toBe(200);
      expect(login.body.user.name).toBe('Original');
      expect((await t.req('POST', '/auth/login', { body: { email: 'verified@test.it', password: 'new-password-123' } })).status).toBe(401);
    });

    it('deactivated and never verified account: not overwritten', async () => {
      await register('disatt@test.it', { password: PASSWORD, name: 'Original' });
      await t.orm.em.fork().nativeUpdate('User', { email: 'disatt@test.it' }, { deactivatedAt: new Date() });
      const r = await register('disatt@test.it', { password: 'new-password-123', name: 'Intruso' });
      expect(r.status).toBe(202);
      const u = await t.orm.em.fork().findOneOrFail('User', { email: 'disatt@test.it' });
      expect(u).toMatchObject({ name: 'Original' });
      expect(t.mail.outbox.filter((m) => m.a === 'disatt@test.it').at(-1)?.subject).toBe('TeamManix: hai già un account');
    });
  });

  it('validation: short password, terms not accepted, extra fields', async () => {
    const base = { email: 'v@test.it', password: PASSWORD, name: 'A', surname: 'B', acceptTerms: true };
    expect((await t.req('POST', '/auth/registration', { body: { ...base, password: 'corta' } })).status).toBe(400);
    expect((await t.req('POST', '/auth/registration', { body: { ...base, acceptTerms: false } })).status).toBe(400);
    expect((await t.req('POST', '/auth/registration', { body: { ...base, role: 'admin' } })).status).toBe(400);
  });

  it('unique email regardless of case and whitespace', async () => {
    await t.newUser('Case@Test.it');
    const l = await t.req('POST', '/auth/login', { body: { email: '  case@test.IT ', password: PASSWORD } });
    expect(l.status).toBe(200);
    const users = await t.orm.em.fork().count('User', { email: 'case@test.it' });
    expect(users).toBe(1);
  });

  it('login: 403 without a verified email, wrong password and unknown email get the same response', async () => {
    await t.req('POST', '/auth/registration', {
      body: { email: 'nv@test.it', password: PASSWORD, name: 'A', surname: 'B', acceptTerms: true },
    });
    const notVerified = await t.req('POST', '/auth/login', { body: { email: 'nv@test.it', password: PASSWORD } });
    expect(notVerified.status).toBe(403);
    expect(notVerified.body.code).toBe('EMAIL_NOT_VERIFIED');

    await t.newUser('ok@test.it');
    const wrong = await t.req('POST', '/auth/login', { body: { email: 'ok@test.it', password: 'wrong-wrong' } });
    const unknown = await t.req('POST', '/auth/login', { body: { email: 'none@test.it', password: 'wrong-wrong' } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('a token of the wrong type is not valid as access', async () => {
    await t.req('POST', '/auth/registration', {
      body: { email: 'type@test.it', password: PASSWORD, name: 'A', surname: 'B', acceptTerms: true },
    });
    const tokenVerify = t.tokenFromMail('type@test.it');
    expect((await t.req('GET', '/auth/me', { token: tokenVerify })).status).toBe(401);
  });

  it('a new account has no club: club routes 403, club creation ok', async () => {
    const s = await t.newUser('only@test.it');
    expect(s.activeClub).toBeNull();
    expect(s.memberships).toEqual([]);
    expect((await t.req('GET', '/invitations', { token: s.accessToken })).status).toBe(403);

    const c = await t.req('POST', '/club', { token: s.accessToken, body: { name: 'ASD Test', acceptDpa: true } });
    expect(c.status).toBe(201);
    expect(c.body.activeClub.name).toBe('ASD Test');
    expect((await t.req('GET', '/invitations', { token: c.body.accessToken })).status).toBe(200);

    const withoutDpa = await t.req('POST', '/club', { token: s.accessToken, body: { name: 'Other', acceptDpa: false } });
    expect(withoutDpa.status).toBe(400);

    // With a single club the login goes straight in.
    const l = await t.req('POST', '/auth/login', { body: { email: 'only@test.it', password: PASSWORD } });
    expect(l.body.activeClub.name).toBe('ASD Test');
  });

  it('password reset: single-use token, invalidates previous sessions', async () => {
    const s = await t.newUser('reset@test.it');
    await t.req('POST', '/auth/password-forgotten', { body: { email: 'reset@test.it' } });
    const unknown = await t.req('POST', '/auth/password-forgotten', { body: { email: 'none@test.it' } });
    expect(unknown.status).toBe(202);

    const token = t.tokenFromMail('reset@test.it');
    const r = await t.req('POST', '/auth/reset-password', { body: { token, password: 'new-password-123' } });
    expect(r.status).toBe(200);
    // Second use of the same link: rejected.
    expect((await t.req('POST', '/auth/reset-password', { body: { token, password: 'other-password-123' } })).status).toBe(400);
    // Previous session invalidated, new password works.
    expect((await t.req('GET', '/auth/me', { token: s.accessToken })).status).toBe(401);
    expect((await t.req('POST', '/auth/login', { body: { email: 'reset@test.it', password: 'new-password-123' } })).status).toBe(200);
    expect((await t.req('POST', '/auth/login', { body: { email: 'reset@test.it', password: PASSWORD } })).status).toBe(401);
  });

  it('password change: old tokens invalid, the returned one is valid immediately', async () => {
    const s = await t.newUser('change@test.it');
    const wrong = await t.req('POST', '/auth/change-password', {
      token: s.accessToken,
      body: { currentPassword: 'wrong-wrong', newPassword: 'new-password-123' },
    });
    expect(wrong.status).toBe(401);

    const ok = await t.req('POST', '/auth/change-password', {
      token: s.accessToken,
      body: { currentPassword: PASSWORD, newPassword: 'new-password-123' },
    });
    expect(ok.status).toBe(200);
    // Within the same second: the token version, not the time, decides.
    expect((await t.req('GET', '/auth/me', { token: s.accessToken })).status).toBe(401);
    expect((await t.req('GET', '/auth/me', { token: ok.body.accessToken })).status).toBe(200);
  });

  it('deactivated account: token rejected', async () => {
    const s = await t.newUser('off@test.it');
    await t.orm.em.fork().nativeUpdate('User', { email: 'off@test.it' }, { deactivatedAt: new Date() });
    expect((await t.req('GET', '/auth/me', { token: s.accessToken })).status).toBe(401);
    expect((await t.req('POST', '/auth/login', { body: { email: 'off@test.it', password: PASSWORD } })).status).toBe(401);
  });

  describe('language', () => {
    const base = { password: PASSWORD, name: 'Awa', surname: 'Diop', acceptTerms: true };
    const last = (a: string) => t.mail.outbox.filter((m) => m.a === a).at(-1)!;

    it('registration in French: verification email in French and language saved', async () => {
      const r = await t.req('POST', '/auth/registration', { body: { ...base, email: 'awa@test.it', language: 'fr' } });
      expect(r.status).toBe(202);
      expect(last('awa@test.it').subject).toBe('TeamManix : confirmez votre adresse e-mail');
      await t.req('POST', '/auth/verify-email', { body: { token: t.tokenFromMail('awa@test.it') } });
      const l = await t.req('POST', '/auth/login', { body: { email: 'awa@test.it', password: PASSWORD } });
      expect(l.body.user.language).toBe('fr');
    });

    it('without a language: Italian. Unsupported language: 400 with code INVALID_DATA', async () => {
      await t.req('POST', '/auth/registration', { body: { ...base, email: 'it@test.it' } });
      expect(last('it@test.it').subject).toBe('TeamManix: conferma la tua email');
      const r = await t.req('POST', '/auth/registration', { body: { ...base, email: 'de@test.it', language: 'de' } });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('INVALID_DATA');
    });

    it('language change: later emails follow the saved language', async () => {
      const s = await t.newUser('language-change@test.it');
      expect(s.user.language).toBe('it');
      const p = await t.req('PATCH', '/auth/language', { token: s.accessToken, body: { language: 'en' } });
      expect(p.status).toBe(200);
      expect((await t.req('GET', '/auth/me', { token: s.accessToken })).body.user.language).toBe('en');
      await t.req('POST', '/auth/password-forgotten', { body: { email: 'language-change@test.it' } });
      expect(last('language-change@test.it').subject).toBe('TeamManix: reset your password');
      expect((await t.req('PATCH', '/auth/language', { token: s.accessToken, body: { language: 'xx' } })).status).toBe(400);
      expect((await t.req('PATCH', '/auth/language', { body: { language: 'fr' } })).status).toBe(401);
    });

    it('every error carries a stable code, independent of the text', async () => {
      const cred = await t.req('POST', '/auth/login', { body: { email: 'none@test.it', password: PASSWORD } });
      expect(cred.body.code).toBe('INVALID_CREDENTIALS');
      const tok = await t.req('GET', '/auth/me', { token: 'not.a.jwt' });
      expect(tok.body.code).toBe('INVALID_TOKEN');
      const none = await t.req('GET', '/auth/me');
      expect(none.body.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });
});
