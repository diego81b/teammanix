import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AccessRole } from '../entities/access-role.entity';
import { Club } from '../entities/club.entity';
import { EnrollmentType, NotificationType, SeasonStatus } from '../entities/enums';
import { Enrollment } from '../entities/enrollment.entity';
import { MedicalCertificate } from '../entities/medical-certificate.entity';
import { Membership } from '../entities/membership.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { sourcesFrom, type EnrollmentStaffCtx } from '../permissions/sources';
import { alertBucket, alertKey, digestKey, staffDigests, type AlertedPerson, type AlertTarget, type StaffCandidate } from './certificate-alerts.rules';
import { currentCertificate, daysUntil } from './certificate.rules';

/**
 * Daily check of medical certificates (ANALISI): each player is told at 30 days, at 15 days and when the certificate
 * expires, and staff with the certificates permission get a weekly digest, per team of their scope, of how many are due.
 *
 * Safe to run again at any time: every notification carries a dedup key, so a second run the same day, a restart, or a
 * second instance sends nothing twice. The certificate that counts is the one with the furthest expiry (rule 11 leaves
 * staff-only people out: only players are looked at).
 */
@Injectable()
export class CertificateAlertsService {
  private readonly logger = new Logger('CertificateAlerts');

  constructor(
    private readonly em: EntityManager,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 7 * * *', { name: 'certificate-alerts', timeZone: 'Europe/Rome' })
  async daily(): Promise<void> {
    await this.run();
  }

  /** `now` is injected so tests (and a manual rerun) can say which day it is. A failing club does not stop the others. */
  async run(now: Date = new Date()): Promise<void> {
    const today = now.toISOString().slice(0, 10);
    const clubs = await this.em.fork().find(Club, {}, { fields: ['id'] });
    for (const club of clubs) {
      try {
        await this.processClub(club.id, today);
      } catch (err) {
        this.logger.error(`certificate alerts for club ${club.id} failed: ${(err as Error).message}`);
      }
    }
  }

  async processClub(clubId: string, today: string): Promise<void> {
    const em = this.em.fork();
    const club = await em.findOneOrFail(Club, clubId, { fields: ['name'] });
    const alerted = await this.alertPlayers(em, clubId, club.name, today);
    if (alerted.length > 0) await this.digest(em, clubId, club.name, today, alerted);
  }

  /** Tells each player whose certificate crossed a threshold, and returns who is due, with or without an account. */
  private async alertPlayers(em: EntityManager, clubId: string, clubName: string, today: string): Promise<AlertedPerson[]> {
    const enrollments = await em.find(
      Enrollment,
      { club: clubId, type: EnrollmentType.PLAYER, endedAt: null, season: { status: { $ne: SeasonStatus.CLOSED } }, person: { disabledAt: null } },
      { filters: false, populate: ['person.user', 'season.team'] },
    );
    const targetsOf = new Map<string, AlertTarget[]>();
    const userOf = new Map<string, string | null>();
    for (const e of enrollments) {
      const target: AlertTarget = { sectionId: e.season.team.section?.id ?? null, teamId: e.season.team.id, seasonId: e.season.id, teamName: e.season.team.name };
      const known = targetsOf.get(e.person.id) ?? [];
      if (!known.some((t) => t.teamId === target.teamId)) known.push(target);
      targetsOf.set(e.person.id, known);
      userOf.set(e.person.id, e.person.user?.id ?? null);
    }
    if (targetsOf.size === 0) return [];

    const certificates = await em.find(MedicalCertificate, { club: clubId, person: { $in: [...targetsOf.keys()] } }, { filters: false });
    const byPerson = new Map<string, MedicalCertificate[]>();
    for (const c of certificates) byPerson.set(c.person.id, [...(byPerson.get(c.person.id) ?? []), c]);

    const alerted: AlertedPerson[] = [];
    for (const [personId, targets] of targetsOf) {
      const current = currentCertificate(byPerson.get(personId) ?? []);
      const bucket = current ? alertBucket(current.expiryDate, today) : null;
      if (!current || !bucket) continue;
      alerted.push({ personId, bucket, targets });
      const userId = userOf.get(personId);
      if (!userId) continue;
      const expired = bucket === 'expired';
      await this.notifications.notify({
        clubId,
        userIds: [userId],
        type: expired ? NotificationType.CERTIFICATE_EXPIRED : NotificationType.CERTIFICATE_EXPIRING,
        params: expired ? { club: clubName, expiry: current.expiryDate } : { club: clubName, expiry: current.expiryDate, days: daysUntil(current.expiryDate, today) },
        dedupKey: alertKey(current.id, current.expiryDate, bucket),
      });
    }
    return alerted;
  }

  /**
   * Counts and the name of the team, never a person: the notification shows on a lock screen and the certificate is
   * health data. The admin gets one digest for the club, the others one for each team of their scope.
   */
  private async digest(em: EntityManager, clubId: string, clubName: string, today: string, alerted: AlertedPerson[]): Promise<void> {
    for (const d of staffDigests(await this.candidates(em, clubId), alerted)) {
      await this.notifications.notify({
        clubId,
        userIds: [d.userId],
        type: NotificationType.CERTIFICATES_DUE,
        params: { club: clubName, ...(d.team ? { team: d.team } : {}), expiring: d.expiring, expired: d.expired },
        link: d.link,
        dedupKey: digestKey(clubId, today, d.seasonId ?? undefined),
      });
    }
  }

  /** Accounts with an access role or an open staff enrollment in the club, with what they may do there. */
  private async candidates(em: EntityManager, clubId: string): Promise<StaffCandidate[]> {
    const [roles, staff, memberships] = await Promise.all([
      em.find(AccessRole, { club: clubId }, { filters: false }),
      em.find(
        Enrollment,
        { club: clubId, type: EnrollmentType.STAFF, endedAt: null, season: { status: { $ne: SeasonStatus.CLOSED } }, person: { user: { $ne: null }, disabledAt: null } },
        { filters: false, populate: ['person.user', 'season.team', 'staffRole'] },
      ),
      em.find(Membership, { club: clubId }, { filters: false }),
    ]);
    const rolesOf = new Map<string, AccessRole[]>();
    for (const r of roles) rolesOf.set(r.user.id, [...(rolesOf.get(r.user.id) ?? []), r]);
    const staffOf = new Map<string, EnrollmentStaffCtx[]>();
    for (const e of staff) {
      const userId = (e.person.user as NonNullable<typeof e.person.user>).id;
      staffOf.set(userId, [...(staffOf.get(userId) ?? []), { policyModel: e.staffRole?.policyModel ?? null, teamId: e.season.team.id }]);
    }
    const diffOf = new Map(memberships.map((m) => [m.user.id, m.diff]));
    const userIds = new Set([...rolesOf.keys(), ...staffOf.keys()]);
    return [...userIds].map((userId) => ({
      userId,
      diff: diffOf.get(userId) ?? {},
      sources: sourcesFrom(
        (rolesOf.get(userId) ?? []).map((r) => ({ role: r.role, scope: r.scope, sectionId: r.section?.id ?? null, teamId: r.team?.id ?? null })),
        staffOf.get(userId) ?? [],
      ),
    }));
  }
}
