import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { detachAccount } from '../club/detach-account';
import { AccessRole } from '../entities/access-role.entity';
import { AccessRoleType, AuditAction, ScopeType } from '../entities/enums';
import { Person } from '../entities/person.entity';
import { User } from '../entities/user.entity';
import { clubsWhereSoleAdmin } from './account-deletion.rules';

/**
 * Erasure of the account (art. 17). The clubs keep the person records, unlinked from the account: erasing
 * data about the person is a decision of the club, which is the data controller.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
  ) {}

  async delete(userId: string, password: string): Promise<void> {
    const user = await this.em.findOneOrFail(User, userId);
    if (!(await argon2.verify(user.passwordHash, password).catch(() => false))) {
      throw new UnauthorizedException({ message: 'Current password is wrong', code: 'PASSWORD_CURRENT_WRONG' });
    }

    const left = await this.em.transactional(async (tem) => {
      const mine = await tem.find(AccessRole, { user: userId, role: AccessRoleType.ADMIN, scope: ScopeType.CLUB }, { filters: false });
      const adminClubs = [...new Set(mine.map((r) => r.club.id))].sort();
      // Lock on the admin rows of every club, always in the same order: two last admins deleting together do not both pass.
      const admins = adminClubs.length
        ? await tem.find(
            AccessRole,
            { club: { $in: adminClubs }, role: AccessRoleType.ADMIN, scope: ScopeType.CLUB },
            { filters: false, lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { club: 'asc', id: 'asc' } },
          )
        : [];
      if (clubsWhereSoleAdmin(admins.map((r) => ({ clubId: r.club.id, userId: r.user.id })), userId).length > 0) {
        throw new ConflictException({
          message: 'You are the last admin of a club: appoint another admin before deleting the account',
          code: 'LAST_ADMIN',
        });
      }

      const people = await tem.find(Person, { user: userId }, { filters: false });
      const roles = await tem.find(AccessRole, { user: userId }, { filters: false });
      const clubs = new Set([...people.map((p) => p.club.id), ...roles.map((r) => r.club.id)]);
      const left = [...clubs].map((clubId) => ({ clubId, personId: people.find((p) => p.club.id === clubId)?.id }));
      for (const c of left) await detachAccount(tem, userId, c.clubId, people.find((p) => p.club.id === c.clubId) ?? null);
      await tem.flush();
      // The foreign keys delete push subscriptions, preferences, notifications and acceptances, and null the audit actor.
      await tem.nativeDelete(User, { id: userId });
      return left;
    });

    // The account no longer exists: the actor stays empty and the row carries no personal data.
    for (const c of left) {
      await this.audit.register({
        action: AuditAction.ACCOUNT_DELETED,
        clubId: c.clubId,
        ...(c.personId ? { entity: 'Person', entityId: c.personId } : {}),
      });
    }
  }
}
