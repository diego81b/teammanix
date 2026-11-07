import { EntityManager } from '@mikro-orm/postgresql';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthContext, AuthRequest } from '../common/auth-context';
import { IS_PUBLIC, WITHOUT_CLUB, ADMIN_ONLY } from '../common/decorators';
import { TENANT_FILTER } from '../entities/tenant.entity';
import { User } from '../entities/user.entity';
import { MembershipsService } from './memberships.service';
import { TokenService } from './token.service';

/**
 * Global guard. For every non-public request:
 * 1. verifies the JWT and that the account exists, is active, has a verified email and a token of the current version (a password change bumps it);
 * 2. if the token has a club, rechecks membership in the DB (detachment applies immediately, not at token expiry),
 *    recomputes the roles and sets the tenant filter on the request;
 * 3. without an active club it rejects, except routes marked @WithoutClub (fail closed).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly em: EntityManager,
    private readonly memberships: MembershipsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const withoutClub = !!this.reflector.getAllAndOverride<boolean>(WITHOUT_CLUB, targets);
    const adminOnly = !!this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets);

    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const m = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '');
    if (!m?.[1]) throw new UnauthorizedException({ message: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' });
    const payload = await this.tokens.readAccess(m[1]);

    const user = await this.em.findOne(User, payload.sub);
    if (!user || user.deactivatedAt || !user.emailVerifiedAt) {
      throw new UnauthorizedException({ message: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    }
    // Exact comparison with the account's token version: no window tied to the one-second resolution of iat.
    if ((payload.tv ?? 0) !== (user.tokenValidFrom?.getTime() ?? 0)) {
      throw new UnauthorizedException({ message: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    }

    let auth: AuthContext = { userId: user.id, clubId: null, roles: [], personId: null, isAdmin: false };
    if (payload.sid) {
      const c = await this.memberships.context(user.id, payload.sid);
      if (!c) throw new ForbiddenException({ message: 'You no longer belong to this club', code: 'CLUB_NOT_ACCESSIBLE' });
      auth = c;
      this.em.setFilterParams(TENANT_FILTER, { clubId: c.clubId });
    } else if (!withoutClub) {
      throw new ForbiddenException({ message: 'Select or create a club', code: 'CLUB_NOT_SELECTED' });
    }

    if (adminOnly && !auth.isAdmin) throw new ForbiddenException({ message: 'Operation reserved to club admins', code: 'ADMIN_ONLY' });
    req.auth = auth;
    return true;
  }
}
