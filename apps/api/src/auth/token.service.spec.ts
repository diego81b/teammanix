import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const SECRET = 'secret-of-test-long-almeno-trentadue-caratteri';
  let tokens: TokenService;
  let jwt: JwtService;

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
    jwt = new JwtService({ secret: SECRET });
    tokens = new TokenService(jwt);
  });

  describe('access', () => {
    it('round trip: user, club and version', async () => {
      const t = await tokens.access('u1', 's1', 123);
      expect(await tokens.readAccess(t)).toMatchObject({ sub: 'u1', sid: 's1', tv: 123 });
    });

    it('without a club the sid claim is missing', async () => {
      const p = await tokens.readAccess(await tokens.access('u1', null, 0));
      expect(p.sid).toBeUndefined();
    });

    it('rejects an email verification token used as access', async () => {
      await expect(tokens.readAccess(await tokens.emailVerify('u1', 'h'))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a token signed with another secret', async () => {
      const other = await new JwtService({ secret: 'other-secret-long-almeno-trentadue-caratteri' }).signAsync(
        { sub: 'u1', typ: 'access' },
        { issuer: 'teammanix', audience: 'teammanix' },
      );
      await expect(tokens.readAccess(other)).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
    });

    it('rejects a token without the expected issuer and audience', async () => {
      const t = await jwt.signAsync({ sub: 'u1', typ: 'access' });
      await expect(tokens.readAccess(t)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects alg none', async () => {
      const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const t = `${b({ alg: 'none', typ: 'JWT' })}.${b({ sub: 'u1', typ: 'access', iss: 'teammanix', aud: 'teammanix' })}.`;
      await expect(tokens.readAccess(t)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects garbage', async () => {
      await expect(tokens.readAccess('not-a-jwt')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('email verification', () => {
    it('valid with the hash it was issued with', async () => {
      const t = await tokens.emailVerify('u1', 'hash-old');
      expect(await tokens.readEmailVerify(t, 'hash-old')).toBe(true);
    });
    it('invalidated by a new registration (different hash)', async () => {
      const t = await tokens.emailVerify('u1', 'hash-old');
      expect(await tokens.readEmailVerify(t, 'hash-new')).toBe(false);
    });
    it('an access token is not valid here', async () => {
      expect(await tokens.readEmailVerify(await tokens.access('u1', null, 0), 'x')).toBe(false);
    });
    it('a reset token is not valid here', async () => {
      expect(await tokens.readEmailVerify(await tokens.reset('u1', 'h'), 'h')).toBe(false);
    });
    it('idDaTokenVerifica reads the user only from a verification token', async () => {
      expect(tokens.idFromTokenVerify(await tokens.emailVerify('u1', 'h'))).toBe('u1');
      expect(tokens.idFromTokenVerify(await tokens.access('u1', null, 0))).toBeNull();
      expect(tokens.idFromTokenVerify('spazzatura')).toBeNull();
    });
  });

  describe('password reset', () => {
    it('valid with the hash it was issued with', async () => {
      const t = await tokens.reset('u1', 'hash-old');
      expect(await tokens.readReset(t, 'hash-old')).toBe(true);
    });
    it('invalidated by a password change (different hash)', async () => {
      const t = await tokens.reset('u1', 'hash-old');
      expect(await tokens.readReset(t, 'hash-new')).toBe(false);
    });
    it('an access token is not a reset token', async () => {
      expect(await tokens.readReset(await tokens.access('u1', null, 0), 'x')).toBe(false);
    });
    it('idDaTokenReset reads the user only from a reset token', async () => {
      expect(tokens.idFromTokenReset(await tokens.reset('u1', 'h'))).toBe('u1');
      expect(tokens.idFromTokenReset(await tokens.access('u1', null, 0))).toBeNull();
      expect(tokens.idFromTokenReset('spazzatura')).toBeNull();
    });
  });
});
