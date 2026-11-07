import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC, WITHOUT_CLUB, ADMIN_ONLY } from '../common/decorators';
import { JwtAuthGuard } from './jwt-auth.guard';

/** The guard without Nest or DB: all dependencies are fakes. */
function scenario(opt: {
  meta?: Partial<Record<string, boolean>>;
  auth?: string;
  payload?: { sub: string; sid?: string; tv?: number };
  user?: object | null;
  context?: object | null;
}) {
  const req: any = { headers: opt.auth ? { authorization: opt.auth } : {} };
  const ctx: any = {
    getHandler: () => 'h',
    getClass: () => 'c',
    switchToHttp: () => ({ getRequest: () => req }),
  };
  const reflector = { getAllAndOverride: (k: string) => opt.meta?.[k] ?? false } as unknown as Reflector;
  const tokens: any = { readAccess: jest.fn(async () => opt.payload ?? { sub: 'u1', tv: 0 }) };
  const em: any = {
    findOne: jest.fn(async () => (opt.user === undefined ? { id: 'u1', emailVerifiedAt: new Date(), deactivatedAt: null, tokenValidFrom: null } : opt.user)),
    setFilterParams: jest.fn(),
  };
  const memberships: any = { context: jest.fn(async () => (opt.context === undefined ? null : opt.context)) };
  const guard = new JwtAuthGuard(reflector, tokens, em, memberships);
  return { guard, ctx, req, em, tokens, memberships };
}

const code = (e: any) => e.response?.code;
const reject = async (p: Promise<unknown>, type: new (...a: any[]) => Error, expectedCode: string) => {
  const e = await p.then(() => null, (x) => x);
  expect(e).toBeInstanceOf(type);
  expect(code(e)).toBe(expectedCode);
};

describe('JwtAuthGuard', () => {
  it('lets public routes through without a token', async () => {
    const s = scenario({ meta: { [IS_PUBLIC]: true } });
    await expect(s.guard.canActivate(s.ctx)).resolves.toBe(true);
    expect(s.tokens.readAccess).not.toHaveBeenCalled();
  });

  it('401 without Authorization', async () => {
    const s = scenario({});
    await reject(s.guard.canActivate(s.ctx), UnauthorizedException, 'AUTHENTICATION_REQUIRED');
  });

  it('401 with a scheme other than Bearer', async () => {
    const s = scenario({ auth: 'Basic abc' });
    await reject(s.guard.canActivate(s.ctx), UnauthorizedException, 'AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['nonexistent account', null],
    ['deactivated account', { id: 'u1', emailVerifiedAt: new Date(), deactivatedAt: new Date(), tokenValidFrom: null }],
    ['email not verified', { id: 'u1', emailVerifiedAt: null, deactivatedAt: null, tokenValidFrom: null }],
  ])('401 if %s', async (_n, user) => {
    const s = scenario({ auth: 'Bearer t', user });
    await reject(s.guard.canActivate(s.ctx), UnauthorizedException, 'INVALID_TOKEN');
  });

  it('401 if the token version does not match (password change)', async () => {
    const s = scenario({
      auth: 'Bearer t',
      payload: { sub: 'u1', tv: 1000 },
      user: { id: 'u1', emailVerifiedAt: new Date(), deactivatedAt: null, tokenValidFrom: new Date(2000) },
    });
    await reject(s.guard.canActivate(s.ctx), UnauthorizedException, 'INVALID_TOKEN');
  });

  it('403 if the token has a club but the membership is gone', async () => {
    const s = scenario({ auth: 'Bearer t', payload: { sub: 'u1', sid: 's1', tv: 0 }, context: null });
    await reject(s.guard.canActivate(s.ctx), ForbiddenException, 'CLUB_NOT_ACCESSIBLE');
  });

  it('403 without an active club, except @WithoutClub (fail closed)', async () => {
    const a = scenario({ auth: 'Bearer t' });
    await reject(a.guard.canActivate(a.ctx), ForbiddenException, 'CLUB_NOT_SELECTED');
    const b = scenario({ auth: 'Bearer t', meta: { [WITHOUT_CLUB]: true } });
    await expect(b.guard.canActivate(b.ctx)).resolves.toBe(true);
    expect(b.req.auth).toMatchObject({ userId: 'u1', clubId: null, isAdmin: false });
  });

  it('with a valid club sets context and tenant filter', async () => {
    const c = { userId: 'u1', clubId: 's1', roles: [], personId: null, isAdmin: false };
    const s = scenario({ auth: 'Bearer t', payload: { sub: 'u1', sid: 's1', tv: 0 }, context: c });
    await expect(s.guard.canActivate(s.ctx)).resolves.toBe(true);
    expect(s.req.auth).toBe(c);
    expect(s.em.setFilterParams).toHaveBeenCalledWith(expect.anything(), { clubId: 's1' });
  });

  it('@AdminOnly: 403 for non-admins, ok for admins', async () => {
    const base = { userId: 'u1', clubId: 's1', roles: [], personId: null };
    const no = scenario({ auth: 'Bearer t', payload: { sub: 'u1', sid: 's1', tv: 0 }, context: { ...base, isAdmin: false }, meta: { [ADMIN_ONLY]: true } });
    await reject(no.guard.canActivate(no.ctx), ForbiddenException, 'ADMIN_ONLY');
    const si = scenario({ auth: 'Bearer t', payload: { sub: 'u1', sid: 's1', tv: 0 }, context: { ...base, isAdmin: true }, meta: { [ADMIN_ONLY]: true } });
    await expect(si.guard.canActivate(si.ctx)).resolves.toBe(true);
  });
});
