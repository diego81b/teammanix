import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/auth-context';
import { AuditAction, EnrollmentStatus, SeasonStatus, SuspensionForm } from '../entities/enums';
import { Enrollment } from '../entities/enrollment.entity';
import { Season } from '../entities/season.entity';
import { Suspension } from '../entities/suspension.entity';
import { loadMatches, loadSuspensions, suspensionData } from '../suspensions/suspension.loader';
import { residue } from '../suspensions/suspension.rules';
import { type SeasonDto, draftExists, toSeasonDto } from '../structure/structure.service';
import { editable, periodValid } from '../structure/season.rules';
import type { CloneSeasonDto, PromoteEnrollmentDto } from './dto-admin';
import { allowedPosition, positionInherited, validateEnrollment } from './enrollment.rules';
import { ERRORS as ENROLLMENT_ERRORS, type EnrollmentOut, enrollmentOut, allowedPositions } from './roster.service';

const seasonNotFound = () => new NotFoundException({ message: 'Season not found', code: 'SEASON_NOT_FOUND' });
const closedSeason = () => new ConflictException({ message: 'The season is closed', code: 'SEASON_CLOSED' });
const personDisabled = () => new ConflictException({ message: 'The person is disabled', code: 'PERSON_DISABLED' });
const enrollmentExists = () => new ConflictException({ message: 'The person is already enrolled', code: 'ENROLLMENT_EXISTS' });

/** Rules 8 and 9: new season from another's roster, promotion of a person to another team. */
@Injectable()
export class CloningService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
  ) {}

  /**
   * Guided cloning: the new season is born as a draft in the same team, with only the chosen enrollments (proposed by
   * the origin roster, which excludes closed and disabled ones). Type, role, position and jersey are copied. Status goes back to
   * "available". Events and communications are not copied. With `carrySuspensions` the matches the origin season could not
   * cover come along as new suspensions by matches (rule 13). All in a single flush: either everything or nothing.
   */
  async clone(a: AuthContext, seasonId: string, dto: CloneSeasonDto): Promise<{ season: SeasonDto; enrollments: number; suspensions: number }> {
    const source = await this.em.findOne(Season, seasonId);
    if (!source) throw seasonNotFound();
    if (!periodValid(dto.startDate, dto.endDate)) {
      throw new BadRequestException({ message: 'Invalid period', code: 'INVALID_DATE_SEASON' });
    }
    if ((await this.em.count(Season, { team: source.team.id, status: SeasonStatus.DRAFT })) > 0) throw draftExists();
    const choices = dto.enrollments.length
      ? await this.em.find(Enrollment, { id: { $in: dto.enrollments }, season: source.id, endedAt: null }, { populate: ['person'] })
      : [];
    if (choices.length !== dto.enrollments.length) {
      throw new BadRequestException({ message: 'Some enrollments do not belong to the season or are closed', code: 'INVALID_ENROLLMENTS' });
    }
    if (choices.some((i) => i.person.disabledAt)) throw personDisabled();

    const fresh = this.em.create(Season, {
      club: a.clubId as string,
      team: source.team,
      name: dto.name,
      startDate: dto.startDate,
      endDate: dto.endDate,
      status: SeasonStatus.DRAFT,
      league: dto.league ?? null,
    });
    const fresher = new Map<string, Enrollment>();
    for (const i of choices) {
      const created = this.em.create(Enrollment, {
        club: a.clubId as string,
        season: fresh,
        person: i.person,
        type: i.type,
        staffRole: i.staffRole,
        position: i.position,
        jerseyNumber: i.jerseyNumber,
        status: EnrollmentStatus.AVAILABLE,
      });
      fresher.set(i.id, created);
    }
    const carried = dto.carrySuspensions ? await this.carrySuspensions(a, source, dto.startDate, fresher) : [];
    try {
      await this.em.flush();
    } catch (e) {
      if (e instanceof UniqueConstraintViolationException) throw draftExists();
      throw e;
    }
    for (const c of carried) {
      await this.audit.register({
        action: AuditAction.SUSPENSION_CREATED,
        userId: a.userId,
        clubId: a.clubId,
        entity: 'suspension',
        entityId: c.suspension.id,
        meta: { carriedFrom: c.from, matchCount: c.suspension.matchCount, startDate: c.suspension.startDate, competitions: c.suspension.competitions },
      });
    }
    return { season: toSeasonDto(fresh), enrollments: choices.length, suspensions: carried.length };
  }

  /**
   * Suspensions by matches with matches left over: the count minus the matches the origin season covers, whether played or
   * still ahead (those stay in the origin season). They start on the first day of the new season, in the same competitions,
   * for the enrollments chosen. A period never carries over.
   */
  private async carrySuspensions(
    a: AuthContext,
    source: Season,
    startDate: string,
    fresher: Map<string, Enrollment>,
  ): Promise<{ suspension: Suspension; from: string }[]> {
    const grouped = await loadSuspensions(this.em, [...fresher.keys()]);
    if (grouped.size === 0) return [];
    const matches = await loadMatches(this.em, source.id);
    const now = new Date();
    const out: { suspension: Suspension; from: string }[] = [];
    for (const [sourceId, list] of grouped) {
      for (const s of list.filter((x) => x.form === SuspensionForm.MATCHES)) {
        const left = residue(suspensionData(s), matches, now);
        if (left < 1) continue;
        const suspension = this.em.create(Suspension, {
          club: a.clubId as string,
          enrollment: fresher.get(sourceId) as Enrollment,
          form: SuspensionForm.MATCHES,
          startDate,
          matchCount: left,
          endDate: null,
          competitions: [...s.competitions],
          originEvent: null,
        });
        out.push({ suspension, from: s.id });
      }
    }
    return out;
  }

  /**
   * Promotion between teams: new enrollment in the destination season, the origin one stays open or is closed
   * by choice. The origin is closed with the same date and audit as a manual closure.
   */
  async promote(a: AuthContext, id: string, dto: PromoteEnrollmentDto): Promise<EnrollmentOut> {
    const source = await this.em.findOne(Enrollment, id, { populate: ['season', 'person'] });
    if (!source) throw new NotFoundException({ message: 'Enrollment not found', code: 'ENROLLMENT_NOT_FOUND' });
    if (!editable(source.season.status)) throw closedSeason();
    if (source.endedAt) throw new ConflictException({ message: 'The enrollment is closed', code: 'ENROLLMENT_CLOSED' });
    if (dto.seasonId === source.season.id) {
      throw new ConflictException({ message: 'The destination is the origin season', code: 'PROMOTION_SAME_SEASON' });
    }
    const destination = await this.em.findOne(Season, dto.seasonId);
    if (!destination) throw seasonNotFound();
    if (!editable(destination.status)) throw closedSeason();
    if (source.person.disabledAt) throw personDisabled();

    // Explicit position: must be in the destination's profile. Inherited: kept only if the profile has it.
    const allowed = await allowedPositions(this.em, destination.id);
    if (!allowedPosition(dto.position, allowed)) throw new BadRequestException(ENROLLMENT_ERRORS.INVALID_POSITION);
    const data = {
      type: source.type,
      staffRole: dto.staffRole ?? source.staffRole,
      position: dto.position ?? positionInherited(source.position, allowed),
      jerseyNumber: dto.jerseyNumber ?? source.jerseyNumber,
    };
    const error = validateEnrollment(data);
    if (error) throw new BadRequestException(ENROLLMENT_ERRORS[error]);
    if ((await this.em.count(Enrollment, { season: destination.id, person: source.person.id, type: source.type })) > 0) {
      throw enrollmentExists();
    }

    const fresh = this.em.create(Enrollment, {
      club: a.clubId as string,
      season: destination,
      person: source.person,
      ...data,
      status: EnrollmentStatus.AVAILABLE,
    });
    if (dto.closeSource) source.endedAt = new Date().toISOString().slice(0, 10);
    try {
      await this.em.flush();
    } catch (e) {
      if (e instanceof UniqueConstraintViolationException) throw enrollmentExists();
      throw e;
    }
    if (dto.closeSource) {
      await this.audit.register({ action: AuditAction.ENROLLMENT_CLOSED, userId: a.userId, clubId: a.clubId, entity: 'Enrollment', entityId: source.id });
    }
    return enrollmentOut(fresh);
  }
}
