import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { appConfig } from '../config/app.config';

const ISSUER = 'teammanix';
const VERIFY_OPTIONS = { algorithms: ['HS256' as const], issuer: ISSUER, audience: ISSUER };

type TokenType = 'access' | 'verify-email' | 'reset-password';

export interface AccessPayload {
  sub: string;
  /** Active club. Absent if the account has not chosen or created one. */
  sid?: string;
  /** Token version of the account at issue time (User.tokenValidFrom in ms, 0 if never changed). */
  tv?: number;
  iat: number;
}

/**
 * All tokens are HS256 JWTs with a `typ` claim: a token of one type is not valid for another use.
 * Password reset: signed with secret + hash of the current password, so it invalidates itself
 * after first use (the hash changes).
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  access(userId: string, clubId: string | null, version: number): Promise<string> {
    return this.sign(
      { sub: userId, tv: version, ...(clubId ? { sid: clubId } : {}) },
      'access',
      appConfig().jwtExpiresIn,
    );
  }

  async readAccess(token: string): Promise<AccessPayload> {
    const p = await this.read<AccessPayload>(token, 'access');
    if (!p) throw new UnauthorizedException({ message: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    return p;
  }

  /** Signed with secret + password hash: a new registration on the same account invalidates previous links. */
  emailVerify(userId: string, passwordHash: string): Promise<string> {
    return this.sign({ sub: userId }, 'verify-email', '24h', appConfig().jwtSecret + passwordHash);
  }

  /** User id inside a verification token, unverified: needed to load the hash used to verify it. */
  idFromTokenVerify(token: string): string | null {
    const d = this.jwt.decode<{ sub?: string; typ?: string } | null>(token);
    return d?.typ === 'verify-email' && typeof d.sub === 'string' ? d.sub : null;
  }

  async readEmailVerify(token: string, passwordHash: string): Promise<boolean> {
    return (await this.read(token, 'verify-email', appConfig().jwtSecret + passwordHash)) !== null;
  }

  reset(userId: string, passwordHash: string): Promise<string> {
    return this.sign({ sub: userId }, 'reset-password', '1h', appConfig().jwtSecret + passwordHash);
  }

  /** User id inside a reset token, unverified: needed to load the hash used to verify it. */
  idFromTokenReset(token: string): string | null {
    const d = this.jwt.decode<{ sub?: string; typ?: string } | null>(token);
    return d?.typ === 'reset-password' && typeof d.sub === 'string' ? d.sub : null;
  }

  async readReset(token: string, passwordHash: string): Promise<boolean> {
    return (await this.read(token, 'reset-password', appConfig().jwtSecret + passwordHash)) !== null;
  }

  private sign(payload: Record<string, unknown>, typ: TokenType, expiry: string, secret?: string): Promise<string> {
    return this.jwt.signAsync(
      { ...payload, typ },
      { expiresIn: expiry as never, algorithm: 'HS256', issuer: ISSUER, audience: ISSUER, ...(secret ? { secret } : {}) },
    );
  }

  private async read<T>(token: string, typ: TokenType, secret?: string): Promise<T | null> {
    try {
      const p = await this.jwt.verifyAsync<T & { typ?: string }>(token, { ...VERIFY_OPTIONS, ...(secret ? { secret } : {}) });
      return p.typ === typ ? p : null;
    } catch {
      return null;
    }
  }
}
