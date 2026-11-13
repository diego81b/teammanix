import { EntityManager } from '@mikro-orm/postgresql';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { detachAccount } from '../club/detach-account';
import type { AuthContext } from '../common/auth-context';
import { Absence } from '../entities/absence.entity';
import { Attendance } from '../entities/attendance.entity';
import { CallupResponseChange } from '../entities/callup-response-change.entity';
import { Callup } from '../entities/callup.entity';
import { Consent } from '../entities/consent.entity';
import { Document } from '../entities/document.entity';
import { Enrollment } from '../entities/enrollment.entity';
import { AuditAction, NotificationType } from '../entities/enums';
import { ExpectedInjury } from '../entities/expected-injury.entity';
import { GuardianLink } from '../entities/guardian-link.entity';
import { Invitation } from '../entities/invitation.entity';
import { MedicalCertificate } from '../entities/medical-certificate.entity';
import { Notification } from '../entities/notification.entity';
import { Person } from '../entities/person.entity';
import { Suspension } from '../entities/suspension.entity';
import { StorageService } from '../storage/storage.service';
import { ANONYMIZED, archiveAction } from './erasure.rules';

const day = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * Export (art. 15 and 20) and permanent deletion (art. 17) of a disabled person. Deletion is hybrid: sensitive records
 * and files go, the record is anonymized and stays under enrollments, call-ups and attendance for the team figures.
 */
@Injectable()
export class ErasureService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** Everything the club keeps about the person, without storage keys, file content or other people's data. */
  async export(a: AuthContext, id: string) {
    const p = await this.archived(id);
    const enrollments = await this.em.find(Enrollment, { person: id }, { populate: ['season.team.activity'], orderBy: { season: { startDate: 'asc' } } });
    const ids = enrollments.map((e) => e.id);
    const of = { enrollment: { $in: ids } };
    const [callups, changes, attendance, absences, suspensions, injuries] = await Promise.all([
      this.em.find(Callup, of, { populate: ['event'], orderBy: { event: { start: 'asc' } } }),
      this.em.find(CallupResponseChange, of, { orderBy: { changedAt: 'asc' } }),
      this.em.find(Attendance, of, { populate: ['event'], orderBy: { event: { start: 'asc' } } }),
      this.em.find(Absence, of, { orderBy: { startDate: 'asc' } }),
      this.em.find(Suspension, of, { orderBy: { startDate: 'asc' } }),
      this.em.find(ExpectedInjury, of),
    ]);
    const certificates = await this.em.find(MedicalCertificate, { person: id }, { populate: ['document'], orderBy: { issueDate: 'asc' } });
    const consents = await this.em.find(Consent, { person: id });
    const links = await this.em.find(GuardianLink, { $or: [{ minor: id }, { guardian: id }] });
    const invitations = await this.em.find(Invitation, this.invitationsOf(p), { orderBy: { createdAt: 'asc' } });
    const mine = <T extends { enrollment: { id: string } }>(rows: T[], e: Enrollment) => rows.filter((r) => r.enrollment.id === e.id);

    await this.audit.register({ action: AuditAction.PERSON_EXPORTED, userId: a.userId, clubId: a.clubId, entity: 'Person', entityId: id });
    return {
      exportedAt: new Date().toISOString(),
      person: {
        id: p.id,
        name: p.name,
        surname: p.surname,
        birthDate: p.birthDate,
        email: p.email,
        phone: p.phone,
        photoUrl: p.photoUrl,
        createdAt: day(p.createdAt),
        completedAt: day(p.completedAt),
        disabledAt: day(p.disabledAt),
        hasAccount: p.user !== null,
      },
      enrollments: enrollments.map((e) => {
        const injury = injuries.find((x) => x.enrollment.id === e.id);
        return {
          activity: e.season.team.activity.name,
          team: e.season.team.name,
          season: e.season.name,
          type: e.type,
          staffRole: e.staffRole,
          position: e.position,
          jerseyNumber: e.jerseyNumber,
          status: e.status,
          endedAt: e.endedAt,
          callups: mine(callups, e).map((c) => ({
            eventId: c.event.id,
            eventType: c.event.type,
            eventStart: day(c.event.start),
            response: c.response,
            reason: c.reason,
            placement: c.placement,
            responseAt: day(c.responseAt),
          })),
          responseChanges: mine(changes, e).map((c) => ({
            eventId: c.event.id,
            from: c.fromResponse,
            fromReason: c.fromReason,
            to: c.toResponse,
            toReason: c.toReason,
            changedAt: day(c.changedAt),
          })),
          attendance: mine(attendance, e).map((x) => ({ eventId: x.event.id, eventType: x.event.type, eventStart: day(x.event.start), outcome: x.outcome })),
          absences: mine(absences, e).map((x) => ({ startDate: x.startDate, endDate: x.endDate })),
          suspensions: mine(suspensions, e).map((x) => ({
            form: x.form,
            startDate: x.startDate,
            matchCount: x.matchCount,
            endDate: x.endDate,
            competitions: x.competitions,
          })),
          expectedInjury: injury ? { startDate: injury.startDate, returnDate: injury.returnDate } : null,
        };
      }),
      certificates: certificates.map((c) => ({
        type: c.type,
        issueDate: c.issueDate,
        expiryDate: c.expiryDate,
        file: c.document ? { mime: c.document.mime, size: c.document.size, uploadedAt: day(c.document.createdAt) } : null,
      })),
      consents: consents.map((c) => ({ type: c.type, status: c.status, date: day(c.data) })),
      guardianLinks: links.map((l) => ({ role: l.guardian.id === id ? 'guardian' : 'minor', relation: l.relation })),
      invitations: invitations.map((i) => ({
        email: i.email,
        role: i.role,
        scope: i.scope,
        status: i.status,
        createdAt: day(i.createdAt),
        expiresAt: day(i.expiresAt),
      })),
    };
  }

  /**
   * Files first, then one transaction for the database. Storage removal is idempotent and the `Document` rows stay
   * until the transaction commits, so an interrupted deletion leaves no orphan file and a retry finishes the job.
   */
  async delete(a: AuthContext, id: string): Promise<void> {
    const clubId = a.clubId as string;
    await this.archived(id);
    const documents = await this.em.find(Document, { person: id });
    for (const d of documents) await this.storage.remove(d.storageKey);

    await this.em.transactional(async (tem) => {
      const q = { filters: false } as const;
      const p = await tem.findOneOrFail(Person, { id, club: clubId }, q);
      const enrollments = (await tem.find(Enrollment, { person: id, club: clubId }, { ...q, fields: ['id'] })).map((e) => e.id);
      // Absences and suspensions hold only dates: they stay under the anonymized record, so the figures do not change.
      await tem.nativeDelete(ExpectedInjury, { club: clubId, enrollment: { $in: enrollments } }, q);
      await this.removeNotifications(tem, clubId, p, enrollments);
      await tem.nativeDelete(MedicalCertificate, { club: clubId, person: id }, q);
      await tem.nativeDelete(Document, { club: clubId, person: id }, q);
      await tem.nativeDelete(Consent, { club: clubId, person: id }, q);
      await tem.nativeUpdate(Consent, { club: clubId, grantedBy: id }, { grantedBy: null }, q);
      await tem.nativeDelete(GuardianLink, { club: clubId, $or: [{ minor: id }, { guardian: id }] }, q);
      await tem.nativeDelete(Invitation, { club: clubId, ...this.invitationsOf(p) }, q);
      if (p.user) await detachAccount(tem, p.user.id, clubId, p);
      Object.assign(p, ANONYMIZED, { anonymizedAt: new Date() });
    });
    await this.audit.register({ action: AuditAction.PERSON_DELETED, userId: a.userId, clubId, entity: 'Person', entityId: id });
  }

  /**
   * The absence notifications the staff received carry the person's name. They go: by key (`absence:<id>`,
   * `absence-freed:<enrollmentId>:...`) and, for rows written before the key held the enrollment, by name.
   */
  private async removeNotifications(tem: EntityManager, clubId: string, p: Person, enrollments: string[]): Promise<void> {
    const q = { filters: false } as const;
    const absences = await tem.find(Absence, { club: clubId, enrollment: { $in: enrollments } }, { ...q, fields: ['id'] });
    const name = [p.name, p.surname].filter(Boolean).join(' ');
    await tem.nativeDelete(
      Notification,
      {
        club: clubId,
        $or: [
          { dedupKey: { $in: absences.map((x) => `absence:${x.id}`) } },
          ...enrollments.map((e) => ({ dedupKey: { $like: `absence-freed:${e}:%` } })),
          ...(name ? [{ type: { $in: [NotificationType.ABSENCE_DECLARED, NotificationType.ABSENCE_FREED] }, params: { person: name } }] : []),
        ],
      },
      q,
    );
  }

  private invitationsOf(p: Person) {
    return p.email ? { $or: [{ person: p.id }, { email: p.email }] } : { person: p.id };
  }

  private async archived(id: string): Promise<Person> {
    const p = await this.em.findOne(Person, id);
    const outcome = p ? archiveAction(p) : 'PERSON_NOT_FOUND';
    if (outcome === 'PERSON_NOT_FOUND') throw new NotFoundException({ message: 'Person not found', code: 'PERSON_NOT_FOUND' });
    if (outcome === 'PERSON_NOT_DISABLED') throw new ConflictException({ message: 'The person is not disabled', code: 'PERSON_NOT_DISABLED' });
    return p as Person;
  }
}
