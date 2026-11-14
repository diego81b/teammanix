import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/auth-context';
import { Membership } from '../entities/membership.entity';
import { AuditAction, SeasonStatus, ScopeType, EnrollmentType } from '../entities/enums';
import { Enrollment } from '../entities/enrollment.entity';
import { Person } from '../entities/person.entity';
import { AccessRole } from '../entities/access-role.entity';
import { Club } from '../entities/club.entity';
import { User } from '../entities/user.entity';
import { effective, defaultValue, validateDiff, type PolicyKey, type DiffPolicy, type RolePolicy } from './policy';

export interface PermissionDtoRole {
  role: RolePolicy;
  scope: ScopeType;
  /** Section or team the role is limited to. */
  destination: string | null;
  /** Season of the enrollment, staff only. */
  season: string | null;
}

export interface PermissionDto {
  userId: string;
  name: string;
  surname: string;
  email: string;
  roles: PermissionDtoRole[];
  diff: DiffPolicy;
  /** Policies of the role models, before the diff: the UI needs them to show "Customized". */
  defaultValue: PolicyKey[];
  effective: PolicyKey[];
  /** false for the admin: their policies cannot be removed. */
  editable: boolean;
}

/**
 * Policies per person. Only saving and reading for the permissions screen live here: applying them
 * to endpoints (with the role's scope) arrives when staff and managers get their own endpoints.
 */
@Injectable()
export class PermissionsService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
  ) {}

  /** Accounts with at least one management role: admin, manager or staff in a non-closed season. Excludes disabled people. */
  async list(): Promise<PermissionDto[]> {
    const [roles, enrollments, memberships, disabled] = await Promise.all([
      this.em.find(AccessRole, {}, { populate: ['user', 'section', 'team'] }),
      this.em.find(
        Enrollment,
        {
          type: EnrollmentType.STAFF,
          endedAt: null,
          season: { status: { $ne: SeasonStatus.CLOSED } },
          person: { user: { $ne: null }, disabledAt: null },
        },
        { populate: ['person.user', 'season.team'] },
      ),
      this.em.find(Membership, {}),
      this.em.find(Person, { user: { $ne: null }, disabledAt: { $ne: null } }),
    ]);
    const outside = new Set(disabled.map((p) => p.user?.id));

    const byKey = new Map<string, { user: User; roles: PermissionDtoRole[] }>();
    const item = (u: User) => {
      let v = byKey.get(u.id);
      if (!v) byKey.set(u.id, (v = { user: u, roles: [] }));
      return v;
    };
    for (const r of roles) {
      if (outside.has(r.user.id)) continue;
      item(r.user).roles.push({ role: r.role, scope: r.scope, destination: r.team?.name ?? r.section?.name ?? null, season: null });
    }
    for (const i of enrollments) {
      const u = i.person.user as User;
      item(u).roles.push({ role: i.staffRole ?? 'other', scope: ScopeType.TEAM, destination: i.season.team.name, season: i.season.name });
    }

    const diffOf = new Map(memberships.map((a) => [a.user.id, a.diff]));
    return [...byKey.values()]
      .map(({ user, roles: rr }): PermissionDto => {
        const diff = diffOf.get(user.id) ?? {};
        const types = rr.map((x) => x.role);
        return {
          userId: user.id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          roles: rr,
          diff,
          defaultValue: defaultValue(types),
          effective: effective(types, diff),
          editable: !types.includes('admin'),
        };
      })
      .sort((x, y) => x.surname.localeCompare(y.surname) || x.name.localeCompare(y.name));
  }

  /** Replaces the account's diff. An empty map restores the defaults. */
  async set(a: AuthContext, userId: string, value: unknown): Promise<PermissionDto> {
    const diff = validateDiff(value);
    if (!diff) throw new BadRequestException({ message: 'Invalid policy', code: 'INVALID_POLICY' });

    const current = (await this.list()).find((v) => v.userId === userId);
    if (!current) throw new NotFoundException({ message: 'Account not found in this club', code: 'ACCESS_NOT_FOUND' });
    if (!current.editable) {
      throw new ConflictException({ message: 'The admin always has all permissions', code: 'POLICY_ADMIN_NOT_EDITABLE' });
    }

    const clubId = a.clubId as string;
    await this.em.transactional(async (tem) => {
      const row = await tem.findOne(Membership, { user: userId });
      if (Object.keys(diff).length === 0) {
        if (row) tem.remove(row);
      } else if (row) {
        row.diff = diff;
      } else {
        tem.create(Membership, { club: tem.getReference(Club, clubId), user: tem.getReference(User, userId), diff });
      }
    });
    await this.audit.register({
      action: AuditAction.POLICY_MODIFIED,
      userId: a.userId,
      clubId,
      entity: 'User',
      entityId: userId,
      meta: { diff },
    });
    const types = current.roles.map((r) => r.role);
    return { ...current, diff, effective: effective(types, diff) };
  }
}
