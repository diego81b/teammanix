import { EntityManager } from '@mikro-orm/postgresql';
import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { AuditLog } from '../entities/audit-log.entity';
import { Club } from '../entities/club.entity';
import { User } from '../entities/user.entity';
import type { AuditAction } from '../entities/enums';

export interface AuditEvent {
  action: AuditAction;
  userId?: string | null;
  clubId?: string | null;
  entity?: string;
  entityId?: string;
  /** Never health data or passwords. */
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly em: EntityManager) {}

  /**
   * Writes through a separate EntityManager, so the log survives the rollback of the business transaction
   * (for example a failed login). A write error must not fail the request.
   */
  async register(e: AuditEvent): Promise<void> {
    try {
      const em = this.em.fork();
      em.create(AuditLog, {
        action: e.action,
        user: e.userId ? em.getReference(User, e.userId) : null,
        club: e.clubId ? em.getReference(Club, e.clubId) : null,
        entity: e.entity ?? null,
        entityId: e.entityId ?? null,
        meta: e.meta ?? null,
      });
      await em.flush();
    } catch (err) {
      this.logger.error(`audit write failed for ${e.action}: ${(err as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
