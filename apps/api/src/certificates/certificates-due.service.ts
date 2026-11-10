import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/auth-context';
import { AuditAction, EnrollmentType } from '../entities/enums';
import { Enrollment } from '../entities/enrollment.entity';
import { AuthorizationsService } from '../permissions/authorizations.service';
import { todayIso } from './certificate.rules';
import { CertificatesService } from './certificates.service';
import { dueRows, type DueRow } from './certificate-due.rules';

/**
 * Names behind the counts of the weekly digest (GDPR art. 9: the notification carries none). Health data, so the scope
 * is checked on the server, only status and dates leave, and every read is traced.
 */
@Injectable()
export class CertificatesDueService {
  constructor(
    private readonly em: EntityManager,
    private readonly authz: AuthorizationsService,
    private readonly certificates: CertificatesService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Players of the season whose certificate expires within 30 days or has expired. Needs `certificates.status` in the
   * team (404 for a season of another club, 403 `PERMISSION_DENIED` without it). Players only (rule 11), not disabled,
   * still enrolled. The access is audited like any other certificate read, with no content.
   */
  async ofSeason(a: AuthContext, seasonId: string): Promise<DueRow[]> {
    await this.authz.request(a, 'certificates.status', { seasonId });
    const enrollments = await this.em.find(
      Enrollment,
      { season: seasonId, type: EnrollmentType.PLAYER, endedAt: null, person: { disabledAt: null } },
      { populate: ['person'] },
    );
    const expiries = await this.certificates.expiries(enrollments.map((e) => e.person.id));
    const rows = dueRows(
      enrollments.map((e) => ({ personId: e.person.id, name: e.person.name, surname: e.person.surname, expiry: expiries.get(e.person.id) ?? null })),
      todayIso(),
    );
    await this.audit.register({ action: AuditAction.CERTIFICATE_READ, userId: a.userId, clubId: a.clubId, entity: 'Season', entityId: seasonId });
    return rows;
  }
}
