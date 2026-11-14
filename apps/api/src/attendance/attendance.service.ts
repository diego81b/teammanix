import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { loadEvent, permissionDenied } from '../callups/event-access';
import type { AuthContext } from '../common/auth-context';
import { Attendance } from '../entities/attendance.entity';
import { Enrollment } from '../entities/enrollment.entity';
import { AttendanceOutcome, AuditAction, EnrollmentType, type StaffRole } from '../entities/enums';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';
import { toEventDto, type EventDto } from '../events/events.service';
import { canReadSeasonEvents } from '../events/visibility';
import { AuthorizationsService } from '../permissions/authorizations.service';
import type { AttendanceDto } from './dto';
import { disabledMask, recordable, summarize, viewOf, type Summary } from './attendance.rules';

/** One person of the event. A disabled person keeps the row for the totals, without the name (rule 12). */
export interface AttendanceRow {
  enrollmentId: string;
  type: EnrollmentType;
  staffRole: StaffRole | null;
  jerseyNumber: number | null;
  name: string | null;
  surname: string | null;
  disabled: boolean;
  outcome: AttendanceOutcome | null;
}

export type AttendanceViewOut =
  | { view: 'manage' | 'read'; event: EventDto; canRecord: boolean; summary: Summary; rows: AttendanceRow[] }
  | { view: 'stats'; event: EventDto; summary: Summary }
  | {
      view: 'player';
      event: EventDto;
      mine: { enrollmentId: string; outcome: AttendanceOutcome | null } | null;
      /** Only the staff recorded present or late. The other players are never shown. */
      staffPresent: { enrollmentId: string; name: string | null; surname: string | null; staffRole: StaffRole | null }[];
    };

const enrollmentNotFound = () => new NotFoundException({ message: 'Enrollment not found', code: 'ENROLLMENT_NOT_FOUND' });
const ATTENDED = new Set<AttendanceOutcome | null>([AttendanceOutcome.PRESENT, AttendanceOutcome.LATE]);

/**
 * Attendance of an event (slice 5). Check order: the event exists in the club (404), the person may (403), the event and
 * season state (409), the enrollment (404), then the data (400, already refused by class-validator).
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly em: EntityManager,
    private readonly authz: AuthorizationsService,
    private readonly audit: AuditService,
  ) {}

  async view(a: AuthContext, eventId: string): Promise<AttendanceViewOut> {
    const target = await this.authz.target(a.clubId as string, { eventId }); // 404 EVENT_NOT_FOUND
    const event = await loadEvent(this.em, eventId);
    const own = a.personId ? await this.em.find(Enrollment, { person: a.personId, season: event.season.id }, { filters: false, fields: ['type'] }) : [];
    const season = { id: event.season.id, sectionId: target.sectionId, teamId: target.teamId as string };
    const view = viewOf({
      canRecord: await this.authz.can(a, 'attendances.record', { eventId }),
      isStaff: own.some((e) => e.type === EnrollmentType.STAFF),
      isPlayer: own.some((e) => e.type === EnrollmentType.PLAYER),
      readsSeason: a.isAdmin || canReadSeasonEvents(a.roles, [], season),
    });
    if (view === 'none') throw permissionDenied();

    const dto = toEventDto(event, target.teamId as string);
    const rows = await this.rows(event, a.isAdmin);
    const summary = summarize(rows.map((r) => r.outcome));
    if (view === 'stats') return { view, event: dto, summary };
    if (view === 'player') {
      const mine = own.find((e) => e.type === EnrollmentType.PLAYER);
      return {
        view,
        event: dto,
        mine: mine ? { enrollmentId: mine.id, outcome: rows.find((r) => r.enrollmentId === mine.id)?.outcome ?? null } : null,
        staffPresent: rows
          .filter((r) => r.type === EnrollmentType.STAFF && !r.disabled && ATTENDED.has(r.outcome))
          .map((r) => ({ enrollmentId: r.enrollmentId, name: r.name, surname: r.surname, staffRole: r.staffRole })),
      };
    }
    return { view, event: dto, canRecord: view === 'manage', summary, rows };
  }

  async record(a: AuthContext, eventId: string, enrollmentId: string, dto: AttendanceDto): Promise<{ enrollmentId: string; outcome: AttendanceOutcome }> {
    const event = await this.writable(a, eventId);
    const enrollment = await this.enrollment(event, enrollmentId);
    const current = await this.em.findOne(Attendance, { event: event.id, enrollment: enrollment.id });
    if (current?.outcome === dto.outcome) return { enrollmentId, outcome: current.outcome };

    const row =
      current ??
      this.em.create(Attendance, { club: a.clubId as string, event, enrollment, outcome: dto.outcome, registeredBy: a.userId, registeredAt: new Date() });
    const from = current?.outcome ?? null;
    if (current) {
      current.outcome = dto.outcome;
      current.registeredBy = this.em.getReference(User, a.userId);
      current.registeredAt = new Date();
    }
    try {
      await this.em.flush();
    } catch (e) {
      // Two coaches marking the same person at once: the unique constraint settles the race.
      if (e instanceof UniqueConstraintViolationException) {
        throw new ConflictException({ message: 'The attendance was changed in the meantime', code: 'ATTENDANCE_CONFLICT' });
      }
      throw e;
    }
    await this.audit.register({
      action: from === null ? AuditAction.ATTENDANCE_RECORDED : AuditAction.ATTENDANCE_MODIFIED,
      ...this.trail(a, row.id, event.id, enrollmentId, from, dto.outcome),
    });
    return { enrollmentId, outcome: dto.outcome };
  }

  async clear(a: AuthContext, eventId: string, enrollmentId: string): Promise<void> {
    const event = await this.writable(a, eventId);
    const enrollment = await this.enrollment(event, enrollmentId);
    const current = await this.em.findOne(Attendance, { event: event.id, enrollment: enrollment.id });
    if (!current) return;
    const trail = this.trail(a, current.id, event.id, enrollmentId, current.outcome, null);
    this.em.remove(current);
    await this.em.flush();
    await this.audit.register({ action: AuditAction.ATTENDANCE_CLEARED, ...trail });
  }

  /** The person holds the policy in the team of the event, and the event took place in a season that is not closed. */
  private async writable(a: AuthContext, eventId: string): Promise<Event> {
    await this.authz.request(a, 'attendances.record', { eventId });
    const event = await loadEvent(this.em, eventId);
    const verdict = recordable(event, event.season.status, new Date());
    if (verdict === 'SEASON_CLOSED') throw new ConflictException({ message: 'The season is closed', code: 'SEASON_CLOSED' });
    if (verdict === 'ATTENDANCE_NOT_OPEN') throw new ConflictException({ message: 'The attendance check is not open yet', code: 'ATTENDANCE_NOT_OPEN' });
    if (verdict === 'EVENT_NOT_RECORDABLE') throw new ConflictException({ message: 'The event was not played', code: 'EVENT_NOT_RECORDABLE' });
    return event;
  }

  /** An enrollment of the season of the event, of a person who is not disabled. */
  private async enrollment(event: Event, id: string): Promise<Enrollment> {
    const enrollment = await this.em.findOne(Enrollment, { id, season: event.season.id, person: { disabledAt: null } });
    if (!enrollment) throw enrollmentNotFound();
    return enrollment;
  }

  /**
   * The people of the event: whoever has a row, plus the open enrollments of people not disabled. A person disabled after
   * the event keeps the row for the totals; one who left the team and was never marked is not listed.
   */
  private async rows(event: Event, isAdmin: boolean): Promise<AttendanceRow[]> {
    const marks = await this.em.find(Attendance, { event: event.id });
    const outcomes = new Map(marks.map((m) => [m.enrollment.id, m.outcome]));
    const enrollments = await this.em.find(
      Enrollment,
      { season: event.season.id, $or: [{ id: { $in: [...outcomes.keys()] } }, { endedAt: null, person: { disabledAt: null } }] },
      { populate: ['person'] },
    );
    const rows = enrollments.map((e) =>
      disabledMask(
        {
          enrollmentId: e.id,
          type: e.type,
          staffRole: e.staffRole,
          jerseyNumber: e.jerseyNumber,
          name: e.person.name as string | null,
          surname: e.person.surname,
          disabled: e.person.disabledAt !== null,
          outcome: outcomes.get(e.id) ?? null,
        },
        isAdmin,
      ),
    );
    const byType = (r: AttendanceRow) => (r.type === EnrollmentType.STAFF ? 0 : 1);
    return rows.sort(
      (x, y) => byType(x) - byType(y) || (x.surname ?? '￿').localeCompare(y.surname ?? '￿') || (x.name ?? '').localeCompare(y.name ?? ''),
    );
  }

  /** Outcomes only in the audit, never a note: there is none. */
  private trail(a: AuthContext, id: string, eventId: string, enrollmentId: string, from: AttendanceOutcome | null, to: AttendanceOutcome | null) {
    return { userId: a.userId, clubId: a.clubId, entity: 'attendance', entityId: id, meta: { eventId, enrollmentId, from, to } };
  }
}
