import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { blockOn } from '../absences/absence.rules';
import { certificateStatus } from '../certificates/certificate.rules';
import { CertificatesService } from '../certificates/certificates.service';
import type { AuthContext } from '../common/auth-context';
import { Absence } from '../entities/absence.entity';
import { Callup } from '../entities/callup.entity';
import { Club } from '../entities/club.entity';
import { Enrollment } from '../entities/enrollment.entity';
import { CallupResponse, EnrollmentStatus, EnrollmentType, EventStatus, EventType, Placement, type StaffRole } from '../entities/enums';
import { Event } from '../entities/event.entity';
import { localDate } from '../events/event.rules';
import { loadMatches, loadSuspensions, suspensionBlock } from '../suspensions/suspension.loader';
import { toEventDto, type EventDto } from '../events/events.service';
import { AuthorizationsService } from '../permissions/authorizations.service';
import type { CallUpDto, PlacementDto } from './dto';
import { canCallUp, evaluate, partition, type Reason } from './callup.rules';
import { loadEvent, openEvent, permissionDenied, viewFor } from './event-access';
import { ResponsesService, type StaffRow } from './responses.service';

/** Row of the staff view (manage and read). */
export interface CallupRow {
  enrollmentId: string;
  personId: string;
  name: string;
  surname: string | null;
  jerseyNumber: number | null;
  position: string | null;
  status: EnrollmentStatus;
  /** Only for called-up people. */
  response: CallupResponse | null;
  placement: Placement | null;
  /** The call-up was already sent. */
  notified: boolean;
  reasons: Reason[];
}

export interface StaffLists {
  event: EventDto;
  view: 'manage' | 'read';
  starterBench: boolean;
  blockCertificate: boolean;
  calledUp: CallupRow[];
  callable: CallupRow[];
  notCallable: CallupRow[];
  /** Every staff member of the season with their answer, and the viewer's own row marked. */
  staff: StaffRow[];
  /** The club asks for it and no coach declared available. */
  noCoachWarning: boolean;
}

/**
 * What the player sees: only who is called up and the answers. Never reasons, warnings, marks or the other lists:
 * being on the not callable list would reveal injuries and certificates of teammates (ANALISI section 7).
 */
export interface PlayerLists {
  event: EventDto;
  view: 'player';
  iAmCalledUp: boolean;
  calledUp: { enrollmentId: string; name: string; surname: string | null; jerseyNumber: number | null; response: CallupResponse; mine: boolean }[];
  /** Only the staff who declared available. Not available and no answer are never shown to players. */
  staff: { enrollmentId: string; name: string; surname: string | null; staffRole: StaffRole | null }[];
}

const notFound = () => new NotFoundException({ message: 'Enrollment not found', code: 'ENROLLMENT_NOT_FOUND' });
const callupNotFound = () => new NotFoundException({ message: 'The player is not called up', code: 'CALLUP_NOT_FOUND' });

/**
 * Call-up of an event (slice 4). Check order: the event exists in the club (404), the person may (403),
 * the event and season state (409), then the data (400). Class-validator already refused malformed payloads.
 */
@Injectable()
export class CallupsService {
  constructor(
    private readonly em: EntityManager,
    private readonly authz: AuthorizationsService,
    private readonly certificates: CertificatesService,
    private readonly responses: ResponsesService,
  ) {}

  async lists(a: AuthContext, eventId: string): Promise<StaffLists | PlayerLists> {
    const target = await this.authz.target(a.clubId as string, { eventId }); // 404 EVENT_NOT_FOUND
    const event = await this.load(eventId);
    const { view, own } = await viewFor(this.em, this.authz, a, event, target);
    if (view === 'none') throw permissionDenied();

    const rows = await this.rows(event);
    const dto = toEventDto(event, target.teamId as string);
    const staff = await this.responses.staffOf(event, own.filter((e) => e.type === EnrollmentType.STAFF).map((e) => e.id));
    if (view === 'player') return this.playerLists(dto, rows, own.filter((e) => e.type === EnrollmentType.PLAYER).map((e) => e.id), staff.rows);

    const { calledUp, callable, notCallable } = partition(rows);
    const club = await this.em.findOneOrFail(Club, a.clubId as string, { fields: ['blockCertificateExpired'] });
    return {
      event: dto,
      view,
      starterBench: event.season.team.activity.sportProfile.starterBench,
      blockCertificate: club.blockCertificateExpired,
      calledUp,
      callable,
      notCallable,
      staff: staff.rows,
      noCoachWarning: staff.noCoachWarning,
    };
  }

  async add(a: AuthContext, eventId: string, dto: CallUpDto): Promise<CallupRow> {
    await this.authz.request(a, 'callups.manage', { eventId });
    const event = await this.open(eventId);
    const enrollment = await this.enrollment(event, dto.enrollmentId);
    const rows = await this.rows(event, [enrollment]);
    const row = rows[0] as CallupRow & { calledUp: boolean };
    if (row.calledUp) throw new ConflictException({ message: 'The player is already called up', code: 'CALLUP_EXISTS' });

    const verdict = canCallUp(row.reasons, dto.confirm === true);
    if (verdict === 'NOT_CALLABLE') {
      throw new ConflictException({
        message: 'The player cannot be called up',
        code: 'ENROLLMENT_NOT_CALLABLE',
        reasons: row.reasons.filter((r) => r.severity === 'hard').map((r) => r.code),
      });
    }
    if (verdict === 'CONFIRMATION_REQUIRED') {
      throw new ConflictException({
        message: 'The call-up needs a confirmation',
        code: 'CALLUP_CONFIRMATION_REQUIRED',
        reasons: row.reasons.filter((r) => r.severity === 'confirm').map((r) => r.code),
      });
    }

    this.em.create(Callup, { club: a.clubId as string, event, enrollment, response: CallupResponse.PENDING, reason: null, responseAt: null, notifiedAt: null, placement: null });
    try {
      await this.em.flush();
    } catch (e) {
      // Two simultaneous requests: the unique constraint settles the race.
      if (e instanceof UniqueConstraintViolationException) {
        throw new ConflictException({ message: 'The player is already called up', code: 'CALLUP_EXISTS' });
      }
      throw e;
    }
    return { ...row, response: CallupResponse.PENDING, placement: null, notified: false };
  }

  async remove(a: AuthContext, eventId: string, enrollmentId: string): Promise<void> {
    await this.authz.request(a, 'callups.manage', { eventId });
    const event = await this.open(eventId);
    const callup = await this.callup(event.id, enrollmentId);
    this.em.remove(callup);
    await this.em.flush();
  }

  /** Starter or bench: only for sports whose profile has it, and only for a player already called up. */
  async placement(a: AuthContext, eventId: string, enrollmentId: string, dto: PlacementDto): Promise<CallupRow> {
    await this.authz.request(a, 'callups.manage', { eventId });
    const event = await this.open(eventId);
    const callup = await this.callup(event.id, enrollmentId);
    if (dto.placement === undefined) throw new BadRequestException({ message: 'Invalid data', code: 'INVALID_DATA' });
    if (!event.season.team.activity.sportProfile.starterBench) {
      throw new BadRequestException({ message: 'The sport does not use starters and bench', code: 'PLACEMENT_NOT_ALLOWED' });
    }
    callup.placement = dto.placement;
    await this.em.flush();
    const [row] = await this.rows(event, [callup.enrollment]);
    return row as CallupRow;
  }

  /**
   * Marks as sent the call-ups not sent yet and says who they are. Delivery (in app, email, push) is the notifications
   * slice: it will start from this list. People removed after a send are not told.
   */
  async send(a: AuthContext, eventId: string): Promise<{ notified: { enrollmentId: string; personId: string }[] }> {
    await this.authz.request(a, 'callups.manage', { eventId });
    const event = await this.open(eventId);
    const pending = await this.em.find(
      Callup,
      {
        event: event.id,
        notifiedAt: null,
        enrollment: { type: EnrollmentType.PLAYER, endedAt: null, person: { disabledAt: null } },
      },
      { populate: ['enrollment.person'] },
    );
    const now = new Date();
    for (const c of pending) c.notifiedAt = now;
    await this.em.flush();
    return { notified: pending.map((c) => ({ enrollmentId: c.enrollment.id, personId: c.enrollment.person.id })) };
  }

  /** The people who can appear in the lists: players with an open enrollment in the season, not disabled. */
  private async rows(event: Event, only?: Enrollment[]): Promise<(CallupRow & { calledUp: boolean })[]> {
    const enrollments =
      only ??
      (await this.em.find(
        Enrollment,
        { season: event.season.id, type: EnrollmentType.PLAYER, endedAt: null, person: { disabledAt: null } },
        { populate: ['person'], orderBy: { person: { surname: 'asc', name: 'asc' } } },
      ));
    await this.em.populate(enrollments, ['person']);
    const personIds = enrollments.map((e) => e.person.id);
    const callups = new Map((await this.em.find(Callup, { event: event.id, enrollment: { $in: enrollments.map((e) => e.id) } })).map((c) => [c.enrollment.id, c]));
    const expiries = await this.certificates.expiries(personIds);
    const busy = await this.busyPeople(event, personIds);
    // Absences hang on the enrollment, so they reach only the team of that enrollment.
    const absences = await this.em.find(Absence, { enrollment: { $in: enrollments.map((e) => e.id) } });
    // Suspensions (rule 13) hang on the enrollment and reach matches only: a training never loads them.
    const suspensions = event.type === EventType.MATCH ? await loadSuspensions(this.em, enrollments.map((e) => e.id)) : new Map();
    const matches = suspensions.size > 0 ? await loadMatches(this.em, event.season.id) : [];
    const now = new Date();
    const club = await this.em.findOneOrFail(Club, event.club.id, { fields: ['blockCertificateExpired'] });
    // The certificate counts on the day of the event, not today.
    const onDay = localDate(event.start);
    const ctx = { eventType: event.type, blockCertificate: club.blockCertificateExpired };

    return enrollments.map((e) => {
      const callup = callups.get(e.id);
      const absence = blockOn(absences.filter((x) => x.enrollment.id === e.id), onDay);
      const suspension = suspensionBlock(suspensions.get(e.id), matches, event.id, now);
      const reasons = evaluate({ status: e.status, certificate: certificateStatus(expiries.get(e.person.id) ?? null, onDay), absence, suspension }, ctx);
      if (busy.has(e.person.id)) reasons.push({ code: 'busy_elsewhere', severity: 'warning' });
      return {
        enrollmentId: e.id,
        personId: e.person.id,
        name: e.person.name,
        surname: e.person.surname,
        jerseyNumber: e.jerseyNumber,
        position: e.position,
        status: e.status,
        calledUp: !!callup,
        response: callup?.response ?? null,
        placement: callup?.placement ?? null,
        notified: !!callup?.notifiedAt,
        reasons,
      };
    });
  }

  /**
   * People already called up for another event of the club that overlaps this one. Only the fact is returned, never
   * which event or team (rule 6). Cancelled and postponed events do not count; back to back events do not overlap.
   */
  private async busyPeople(event: Event, personIds: string[]): Promise<Set<string>> {
    if (!personIds.length) return new Set();
    const others = await this.em.find(
      Callup,
      {
        event: { id: { $ne: event.id }, status: { $in: [EventStatus.SCHEDULED, EventStatus.CONCLUDED] }, start: { $lt: event.end }, end: { $gt: event.start } },
        // Only players who may still come: staff availability and declined answers are not a double booking.
        response: { $ne: CallupResponse.DECLINED },
        enrollment: { type: EnrollmentType.PLAYER, person: { $in: personIds } },
      },
      { populate: ['enrollment.person'], fields: ['enrollment.person'] },
    );
    return new Set(others.map((c) => c.enrollment.person.id));
  }

  private playerLists(event: EventDto, rows: (CallupRow & { calledUp: boolean })[], ownEnrollmentIds: string[], staff: StaffRow[]): PlayerLists {
    const calledUp = rows
      .filter((r) => r.calledUp)
      .map((r) => ({
        enrollmentId: r.enrollmentId,
        name: r.name,
        surname: r.surname,
        jerseyNumber: r.jerseyNumber,
        response: r.response as CallupResponse,
        mine: ownEnrollmentIds.includes(r.enrollmentId),
      }));
    // Only the staff who declared available: the others (declined, silent) are for staff, managers and the admin.
    const available = staff
      .filter((s) => s.response === CallupResponse.CONFIRMED)
      .map((s) => ({ enrollmentId: s.enrollmentId, name: s.name, surname: s.surname, staffRole: s.staffRole }));
    return { event, view: 'player', iAmCalledUp: calledUp.some((r) => r.mine), calledUp, staff: available };
  }

  private load(id: string): Promise<Event> {
    return loadEvent(this.em, id);
  }

  /** The event can still be changed: scheduled or postponed, in the active season. */
  private open(id: string): Promise<Event> {
    return openEvent(this.em, id);
  }

  private async enrollment(event: Event, id: string): Promise<Enrollment> {
    const e = await this.em.findOne(
      Enrollment,
      { id, season: event.season.id, type: EnrollmentType.PLAYER, endedAt: null, person: { disabledAt: null } },
      { populate: ['person'] },
    );
    if (!e) throw notFound();
    return e;
  }

  private async callup(eventId: string, enrollmentId: string): Promise<Callup> {
    // Players only: a staff member's availability is theirs to change, not the coach's to remove or mark.
    const c = await this.em.findOne(Callup, { event: eventId, enrollment: { id: enrollmentId, type: EnrollmentType.PLAYER } }, { populate: ['enrollment.person'] });
    if (!c) throw callupNotFound();
    return c;
  }
}
