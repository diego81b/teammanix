import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthContext, CtxRole } from '../common/auth-context';
import { Person } from '../entities/person.entity';
import { AccessRole } from '../entities/access-role.entity';
import { AccessRoleType, ScopeType } from '../entities/enums';

export interface Membership {
  clubId: string;
  name: string;
  roles: CtxRole[];
  /** true if the account is linked to a person record (player or staff) in this club. */
  linkedToPerson: boolean;
  /** true if the linked record exists but the person has not completed it yet: the client shows the form. */
  recordToComplete: boolean;
}

const ctxRole = (r: AccessRole): CtxRole => ({
  role: r.role,
  scope: r.scope,
  activityId: r.activity?.id ?? null,
  teamId: r.team?.id ?? null,
});

/**
 * Memberships are not stored: they derive from AccessRole (admin, manager) and from Person.user
 * (player, staff), each inside a club. These queries run without the tenant filter because by
 * definition they cross the account's clubs: they always filter by user.
 */
@Injectable()
export class MembershipsService {
  constructor(private readonly em: EntityManager) {}

  async list(userId: string): Promise<Membership[]> {
    const [roles, people] = await Promise.all([
      this.em.find(AccessRole, { user: userId }, { filters: false, populate: ['club'] }),
      this.em.find(Person, { user: userId }, { filters: false, populate: ['club'] }),
    ]);
    const byKey = new Map<string, Membership>();
    const item = (id: string, name: string): Membership => {
      let v = byKey.get(id);
      if (!v) byKey.set(id, (v = { clubId: id, name, roles: [], linkedToPerson: false, recordToComplete: false }));
      return v;
    };
    // A disabled person (rule 12) loses access to the whole club, even with roles.
    const disabled = new Set(people.filter((p) => p.disabledAt).map((p) => p.club.id));
    for (const r of roles) if (!disabled.has(r.club.id)) item(r.club.id, r.club.name).roles.push(ctxRole(r));
    for (const p of people) {
      if (p.disabledAt) continue;
      const v = item(p.club.id, p.club.name);
      v.linkedToPerson = true;
      v.recordToComplete = !p.completedAt;
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Context of the account inside a club, or null if it is no longer a member. */
  async context(userId: string, clubId: string): Promise<AuthContext | null> {
    const [roles, person] = await Promise.all([
      this.em.find(AccessRole, { user: userId, club: clubId }, { filters: false }),
      this.em.findOne(Person, { user: userId, club: clubId }, { filters: false }),
    ]);
    if (roles.length === 0 && !person) return null;
    // Rule 12: disabling applies immediately, because this read happens on every request.
    if (person?.disabledAt) return null;
    return {
      userId,
      clubId,
      roles: roles.map(ctxRole),
      personId: person?.id ?? null,
      isAdmin: roles.some((r) => r.role === AccessRoleType.ADMIN && r.scope === ScopeType.CLUB),
    };
  }
}
