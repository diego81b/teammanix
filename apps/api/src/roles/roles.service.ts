import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/auth-context';
import { AuditAction, AccessRoleType, ScopeType } from '../entities/enums';
import { Membership } from '../entities/membership.entity';
import { Person } from '../entities/person.entity';
import { AccessRole } from '../entities/access-role.entity';

export interface RoleDto {
  id: string;
  userId: string;
  name: string;
  surname: string;
  email: string;
  role: AccessRoleType;
  scope: ScopeType;
  sectionId: string | null;
  teamId: string | null;
  /** Name of the section or team the role is limited to. */
  destination: string | null;
}

/** Access roles (admin and manager). Staff and player derive from enrollments and are managed from the roster. */
@Injectable()
export class RolesService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleDto[]> {
    const roles = await this.em.find(AccessRole, {}, { populate: ['user', 'section', 'team'], orderBy: { createdAt: 'asc' } });
    return roles.map((r) => ({
      id: r.id,
      userId: r.user.id,
      name: r.user.name,
      surname: r.user.surname,
      email: r.user.email,
      role: r.role,
      scope: r.scope,
      sectionId: r.section?.id ?? null,
      teamId: r.team?.id ?? null,
      destination: r.team?.name ?? r.section?.name ?? null,
    }));
  }

  /** An admin with club scope cannot be removed if last: the club would be left without management. */
  async remove(a: AuthContext, id: string): Promise<void> {
    const role = await this.em.transactional(async (tem) => {
      // Lock on admin rows, always in the same order: two last admins removing themselves together do not both pass.
      const admin = await tem.find(
        AccessRole,
        { club: a.clubId as string, role: AccessRoleType.ADMIN, scope: ScopeType.CLUB },
        { filters: false, lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: 'asc' } },
      );
      const r = await tem.findOne(AccessRole, { id });
      if (!r) throw new NotFoundException({ message: 'Role not found', code: 'ROLE_NOT_FOUND' });
      if (admin.some((x) => x.id === r.id) && admin.length === 1) {
        throw new ConflictException({ message: 'This is the last admin: appoint another admin before removing them', code: 'LAST_ADMIN' });
      }
      const data = { userId: r.user.id, role: r.role, scope: r.scope };
      tem.remove(r);
      await tem.flush();
      // Without roles or record the account has nothing to apply policies to: a future invitation starts again from the defaults.
      const remain = await tem.count(AccessRole, { user: data.userId });
      const record = await tem.count(Person, { user: data.userId });
      if (remain === 0 && record === 0) await tem.nativeDelete(Membership, { user: data.userId });
      return data;
    });
    await this.audit.register({
      action: AuditAction.ROLE_REMOVED,
      userId: a.userId,
      clubId: a.clubId,
      entity: 'AccessRole',
      entityId: id,
      meta: role,
    });
  }
}
