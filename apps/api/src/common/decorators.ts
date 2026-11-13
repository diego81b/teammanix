import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthContext, AuthRequest } from './auth-context';
import { authLimit } from './auth-limit';

export const IS_PUBLIC = 'isPublic';
export const WITHOUT_CLUB = 'withoutClub';
export const ADMIN_ONLY = 'adminOnly';

/** No token required (registration, login, password reset). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * By default every route requires an active club in the token (fail closed).
 * This decorator makes it usable by an authenticated account that has not yet chosen a club.
 */
export const WithoutClub = () => SetMetadata(WITHOUT_CLUB, true);

/** Requires the admin role with club scope in the active club. */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);

export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AuthRequest>();
  if (!req.auth) throw new Error('CurrentAuth used on a public route');
  return req.auth;
});

/** Strict limit for sensitive routes (login, registration, reset). Raised under test and for the e2e outbox (`authLimit`). */
export const AuthLimit = () => Throttle({ default: { limit: authLimit(process.env), ttl: 60_000 } });
