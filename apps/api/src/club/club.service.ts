import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DOCUMENTS_VERSION } from '../config/app.config';
import { TermsAcceptance } from '../entities/terms-acceptance.entity';
import { AuditAction, AccessRoleType, ScopeType, TypeLegalDocument } from '../entities/enums';
import { Person } from '../entities/person.entity';
import { AccessRole } from '../entities/access-role.entity';
import { Club } from '../entities/club.entity';
import { StaffRole } from '../entities/staff-role.entity';
import { User } from '../entities/user.entity';
import { AuthService, SessionDto } from '../auth/auth.service';
import { DEFAULT_STAFF_ROLES, nameKey } from '../staff-roles/staff-role.rules';
import type { CreateClubDto } from './dto';
import { detachAccount } from './detach-account';

@Injectable()
export class ClubService {
  constructor(
    private readonly em: EntityManager,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /** Whoever creates the club becomes its admin and accepts the DPA on behalf of the club. */
  async create(userId: string, dto: CreateClubDto): Promise<SessionDto> {
    const { user, club } = await this.em.transactional(async (tem) => {
      const u = await tem.findOneOrFail(User, userId);
      const s = tem.create(Club, { name: dto.name });
      tem.create(AccessRole, { club: s, user: u, role: AccessRoleType.ADMIN, scope: ScopeType.CLUB });
      tem.create(TermsAcceptance, { user: u, club: s, type: TypeLegalDocument.DPA, version: DOCUMENTS_VERSION });
      // Creation instants a millisecond apart, so the catalog lists the roles in this order.
      const at = Date.now();
      DEFAULT_STAFF_ROLES[u.language].forEach((r, i) => tem.create(StaffRole, { club: s, ...r, nameKey: nameKey(r.name), createdAt: new Date(at + i) }));
      return { user: u, club: s };
    });
    await this.audit.register({ action: AuditAction.CLUB_CREATED, userId, clubId: club.id, entity: 'Club', entityId: club.id });
    return this.auth.session(user, club.id);
  }

  /**
   * The account leaves the club. The person record and data stay with the club, which owns them:
   * only the account is unlinked. An admin cannot leave if last, otherwise the club would be left without management.
   */
  async detach(userId: string, clubId: string): Promise<SessionDto> {
    const user = await this.em.transactional(async (tem) => {
      // Lock on the club's admin rows: two last admins leaving together must not both pass the check.
      const admin = await tem.find(
        AccessRole,
        { club: clubId, role: AccessRoleType.ADMIN, scope: ScopeType.CLUB },
        { filters: false, lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      const eAdmin = admin.some((r) => r.user.id === userId);
      if (eAdmin && admin.length === 1) {
        throw new ConflictException({
          message: 'You are the last admin: appoint another admin before leaving the club',
          code: 'LAST_ADMIN',
        });
      }

      const person = await tem.findOne(Person, { club: clubId, user: userId }, { filters: false });
      const roles = await detachAccount(tem, userId, clubId, person);
      if (!person && roles === 0) throw new NotFoundException({ message: 'You do not belong to this club', code: 'NOT_CLUB_MEMBER' });
      return tem.findOneOrFail(User, userId);
    });

    await this.audit.register({ action: AuditAction.CLUB_DETACHMENT, userId, clubId, entity: 'Club', entityId: clubId });
    // New token without a club: the one in use is bound to a club the account has left.
    return this.auth.session(user, null);
  }
}
