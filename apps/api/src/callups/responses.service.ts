import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { Callup } from '../entities/callup.entity';
import { CallupResponseChange } from '../entities/callup-response-change.entity';
import { Club } from '../entities/club.entity';
import { Enrollment } from '../entities/enrollment.entity';
import { CallupResponse, EnrollmentType, ReasonDecline, type StaffRole } from '../entities/enums';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';
import { AuthorizationsService } from '../permissions/authorizations.service';
import { checkAnswer, isChange, noCoachAvailable } from './callup.rules';
import type { AnswerDto } from './dto';
import { loadEvent, openEvent, permissionDenied, viewFor } from './event-access';

export interface AnswerResult {
  enrollmentId: string;
  response: CallupResponse;
  reason: ReasonDecline | null;
  responseAt: Date | null;
}

export interface StaffRow {
  enrollmentId: string;
  name: string;
  surname: string | null;
  staffRole: StaffRole | null;
  /** null = no answer yet. */
  response: CallupResponse | null;
  /** The row is the viewer's own. */
  mine: boolean;
}

export interface StaffBlock {
  /** Staff, managers and the admin: every staff member of the season with their answer. */
  rows: StaffRow[];
  /** The club asks for the warning and no coach has declared available. */
  noCoachWarning: boolean;
}

export interface AnswerChange {
  from: CallupResponse;
  fromReason: ReasonDecline | null;
  to: CallupResponse;
  reason: ReasonDecline | null;
  changedAt: Date;
}

/**
 * Answers to an event (slice 4): a player to a call-up, a staff member for their availability. Both live in `Callup`
 * (rule 11). Every change of answer is kept in `CallupResponseChange`, with the date. Check order: the event exists in
 * the club (404), the person may (403), the event and season state (409), then the data (400).
 */
@Injectable()
export class ResponsesService {
  constructor(
    private readonly em: EntityManager,
    private readonly authz: AuthorizationsService,
  ) {}

  /** The called-up player answers on their own enrollment in the season of the event. */
  async answerAsPlayer(a: AuthContext, eventId: string, dto: AnswerDto): Promise<AnswerResult> {
    return this.answer(a, eventId, EnrollmentType.PLAYER, dto);
  }

  /** A staff member declares available or not available, with no call-up needed. */
  async answerAsStaff(a: AuthContext, eventId: string, dto: AnswerDto): Promise<AnswerResult> {
    return this.answer(a, eventId, EnrollmentType.STAFF, dto);
  }

  /** The trail of one person's answers to the event, oldest first. For staff, managers and the admin only. */
  async history(a: AuthContext, eventId: string, enrollmentId: string): Promise<{ changes: AnswerChange[] }> {
    const target = await this.authz.target(a.clubId as string, { eventId }); // 404 EVENT_NOT_FOUND
    const event = await loadEvent(this.em, eventId);
    const { view } = await viewFor(this.em, this.authz, a, event, target);
    if (view !== 'manage' && view !== 'read') throw permissionDenied();
    const rows = await this.em.find(CallupResponseChange, { event: event.id, enrollment: enrollmentId }, { orderBy: { changedAt: 'asc', createdAt: 'asc' } });
    return {
      changes: rows.map((r) => ({ from: r.fromResponse, fromReason: r.fromReason, to: r.toResponse, reason: r.toReason, changedAt: r.changedAt })),
    };
  }

  /**
   * Staff of the season with their answer for the event, for the lists. `viewerEnrollmentIds` marks the viewer's own row.
   * The caller decides what each viewer may see of it.
   */
  async staffOf(event: Event, viewerEnrollmentIds: string[]): Promise<StaffBlock> {
    const enrollments = await this.em.find(
      Enrollment,
      { season: event.season.id, type: EnrollmentType.STAFF, endedAt: null, person: { disabledAt: null } },
      { populate: ['person'], orderBy: { person: { surname: 'asc', name: 'asc' } } },
    );
    const answers = new Map(
      (await this.em.find(Callup, { event: event.id, enrollment: { $in: enrollments.map((e) => e.id) } })).map((c) => [c.enrollment.id, c.response]),
    );
    const rows = enrollments.map((e) => ({
      enrollmentId: e.id,
      name: e.person.name,
      surname: e.person.surname,
      staffRole: e.staffRole,
      response: answers.get(e.id) ?? null,
      mine: viewerEnrollmentIds.includes(e.id),
    }));
    const club = await this.em.findOneOrFail(Club, event.club.id, { fields: ['warnNoCoachAvailable', 'coachRoles'] });
    return { rows, noCoachWarning: club.warnNoCoachAvailable && noCoachAvailable(rows, club.coachRoles) };
  }

  private async answer(a: AuthContext, eventId: string, kind: EnrollmentType, dto: AnswerDto): Promise<AnswerResult> {
    await this.authz.target(a.clubId as string, { eventId }); // 404 EVENT_NOT_FOUND
    const event = await loadEvent(this.em, eventId);
    const enrollment = a.personId
      ? await this.em.findOne(Enrollment, { person: a.personId, season: event.season.id, type: kind, endedAt: null }, { populate: ['person'] })
      : null;
    if (!enrollment || enrollment.person.disabledAt) throw permissionDenied();
    await openEvent(this.em, eventId);

    let callup = await this.em.findOne(Callup, { event: event.id, enrollment: enrollment.id });
    if (!callup && kind === EnrollmentType.PLAYER) {
      throw new NotFoundException({ message: 'The player is not called up', code: 'CALLUP_NOT_FOUND' });
    }
    const verdict = checkAnswer(kind === EnrollmentType.PLAYER ? 'player' : 'staff', dto);
    if (verdict === 'REASON_REQUIRED') {
      throw new BadRequestException({ message: 'A reason is required to decline', code: 'REASON_REQUIRED' });
    }
    if (verdict === 'INVALID_DATA') throw new BadRequestException({ message: 'Invalid data', code: 'INVALID_DATA' });

    const was = { response: callup?.response ?? CallupResponse.PENDING, reason: callup?.reason ?? null };
    if (callup && !isChange(was, dto)) return this.result(enrollment.id, callup);

    const now = new Date();
    callup ??= this.em.create(Callup, { club: a.clubId as string, event, enrollment, response: CallupResponse.PENDING, reason: null, responseAt: null, notifiedAt: null, placement: null });
    this.em.create(CallupResponseChange, {
      club: a.clubId as string,
      event,
      enrollment,
      fromResponse: was.response,
      fromReason: was.reason,
      toResponse: dto.response,
      toReason: dto.reason ?? null,
      changedBy: this.em.getReference(User, a.userId),
      changedAt: now,
    });
    callup.response = dto.response;
    callup.reason = dto.reason ?? null;
    callup.responseAt = now;
    try {
      await this.em.flush();
    } catch (e) {
      // Two taps at once on the first answer: the unique constraint settles the race.
      if (e instanceof UniqueConstraintViolationException) {
        throw new ConflictException({ message: 'The answer is already being saved', code: 'CALLUP_EXISTS' });
      }
      throw e;
    }
    return this.result(enrollment.id, callup);
  }

  private result(enrollmentId: string, c: Callup): AnswerResult {
    return { enrollmentId, response: c.response, reason: c.reason, responseAt: c.responseAt };
  }
}
