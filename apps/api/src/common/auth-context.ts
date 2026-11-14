import type { FastifyRequest } from 'fastify';
import type { AccessRoleType, ScopeType } from '../entities/enums';

export interface CtxRole {
  role: AccessRoleType;
  scope: ScopeType;
  sectionId: string | null;
  teamId: string | null;
}

/**
 * Context of an authenticated request, recomputed from the DB on every request.
 * The JWT carries only user and active club: roles never trust the token.
 */
export interface AuthContext {
  userId: string;
  /** null if the user has not yet chosen or created a club. */
  clubId: string | null;
  roles: CtxRole[];
  /** Person record linked to the account in the active club, if any. */
  personId: string | null;
  /** Admin with club scope. */
  isAdmin: boolean;
}

export type AuthRequest = FastifyRequest & { auth?: AuthContext };
