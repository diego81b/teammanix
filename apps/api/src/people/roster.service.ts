import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { SummaryCertificate } from '../certificates/certificates.service';
import { CertificatesService } from '../certificates/certificates.service';
import type { AuthContext } from '../common/auth-context';
import { AuditAction, StaffRole, EnrollmentStatus, EnrollmentType } from '../entities/enums';
import { Enrollment } from '../entities/enrollment.entity';
import { Person } from '../entities/person.entity';
import { Season } from '../entities/season.entity';
import { editable } from '../structure/season.rules';
import type { EnrollmentDto, EditEnrollmentDto } from './dto-admin';
import { type EnrollmentData, type EnrollmentError, allowedPosition, validateEnrollment } from './enrollment.rules';

export interface RosterRow {
  id: string;
  personId: string;
  name: string;
  surname: string | null;
  type: EnrollmentType;
  staffRole: StaffRole | null;
  position: string | null;
  jerseyNumber: number | null;
  status: EnrollmentStatus;
  /** Players only: staff has no certificate (rule 11). */
  certificate: SummaryCertificate | null;
}

export interface EnrollmentOut extends Omit<RosterRow, 'name' | 'surname' | 'certificate'> {
  seasonId: string;
  endedAt: string | null;
}

export const ERRORS: Record<EnrollmentError, { message: string; code: string }> = {
  STAFF_ROLE_REQUIRED: { message: 'For staff, specify the role', code: 'STAFF_ROLE_REQUIRED' },
  STAFF_ROLE_NOT_ALLOWED: { message: 'The staff role does not apply to a player', code: 'STAFF_ROLE_NOT_ALLOWED' },
  PLAYER_DATA_NOT_ALLOWED: { message: 'Position and jersey apply only to a player', code: 'PLAYER_DATA_NOT_ALLOWED' },
  INVALID_NUMBER_JERSEY: { message: 'Invalid jersey number', code: 'INVALID_NUMBER_JERSEY' },
  INVALID_POSITION: { message: 'The position is not provided by the sport profile', code: 'INVALID_POSITION' },
};

/** Positions allowed by the sport profile of the activity the season belongs to. */
export async function allowedPositions(em: EntityManager, seasonId: string): Promise<string[]> {
  const st = await em.findOneOrFail(Season, seasonId, { populate: ['team.activity.sportProfile'] });
  return st.team.activity.sportProfile.positions;
}

/** Enrollment as it is today, with season and end date. Also used by cloning and promotion. */
export function enrollmentOut(i: Enrollment): EnrollmentOut {
  return {
    id: i.id,
    personId: i.person.id,
    type: i.type,
    staffRole: i.staffRole,
    position: i.position,
    jerseyNumber: i.jerseyNumber,
    status: i.status,
    seasonId: i.season.id,
    endedAt: i.endedAt,
  };
}

const closedSeason = () => new ConflictException({ message: 'The season is closed', code: 'SEASON_CLOSED' });
const closedEnrollment = () => new ConflictException({ message: 'The enrollment is closed', code: 'ENROLLMENT_CLOSED' });

@Injectable()
export class RosterService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
    private readonly certificates: CertificatesService,
  ) {}

  /** Only open enrollments and non-disabled people. */
  async roster(seasonId: string): Promise<RosterRow[]> {
    await this.season(seasonId);
    const enrollments = await this.em.find(
      Enrollment,
      { season: seasonId, endedAt: null, person: { disabledAt: null } },
      { populate: ['person'], orderBy: { type: 'desc', person: { surname: 'asc', name: 'asc' } } },
    );
    const certificates = await this.certificates.summary(
      enrollments.filter((i) => i.type === EnrollmentType.PLAYER).map((i) => i.person.id),
    );
    return enrollments.map((i) => ({
      ...this.out(i),
      name: i.person.name,
      surname: i.person.surname,
      certificate: certificates.get(i.person.id) ?? null,
    }));
  }

  async enroll(a: AuthContext, seasonId: string, dto: EnrollmentDto): Promise<EnrollmentOut> {
    const st = await this.season(seasonId);
    if (!editable(st.status)) throw closedSeason();
    this.check({ type: dto.type, staffRole: dto.staffRole, position: dto.position, jerseyNumber: dto.jerseyNumber });
    await this.checkPosition(st.id, dto.position);
    const person = await this.em.findOne(Person, dto.personId);
    if (!person) throw new NotFoundException({ message: 'Person not found', code: 'PERSON_NOT_FOUND' });
    if (person.disabledAt) throw new ConflictException({ message: 'The person is disabled', code: 'PERSON_DISABLED' });
    const exists = await this.em.count(Enrollment, { season: st.id, person: person.id, type: dto.type });
    if (exists > 0) throw new ConflictException({ message: 'The person is already enrolled', code: 'ENROLLMENT_EXISTS' });

    const i = this.em.create(Enrollment, {
      club: a.clubId as string,
      season: st,
      person,
      type: dto.type,
      staffRole: dto.staffRole ?? null,
      position: dto.position ?? null,
      jerseyNumber: dto.jerseyNumber ?? null,
      status: EnrollmentStatus.AVAILABLE,
    });
    try {
      await this.em.flush();
    } catch (e) {
      // Two simultaneous requests: the unique constraint settles the race.
      if (e instanceof UniqueConstraintViolationException) {
        throw new ConflictException({ message: 'The person is already enrolled', code: 'ENROLLMENT_EXISTS' });
      }
      throw e;
    }
    return this.outComplete(i);
  }

  async edit(a: AuthContext, id: string, dto: EditEnrollmentDto): Promise<EnrollmentOut> {
    const i = await this.open(id);
    this.check({
      type: i.type,
      staffRole: dto.staffRole ?? i.staffRole,
      position: dto.position ?? i.position,
      jerseyNumber: dto.jerseyNumber ?? i.jerseyNumber,
    });
    await this.checkPosition(i.season.id, dto.position);
    const statusBefore = i.status;
    if (dto.staffRole !== undefined) i.staffRole = dto.staffRole;
    if (dto.position !== undefined) i.position = dto.position;
    if (dto.jerseyNumber !== undefined) i.jerseyNumber = dto.jerseyNumber;
    if (dto.status !== undefined) i.status = dto.status;
    await this.em.flush();
    if (i.status !== statusBefore) {
      await this.audit.register({
        action: AuditAction.ENROLLMENT_STATUS_MODIFIED,
        userId: a.userId,
        clubId: a.clubId,
        entity: 'Enrollment',
        entityId: i.id,
        meta: { from: statusBefore, a: i.status },
      });
    }
    return this.outComplete(i);
  }

  /** Closes the enrollment from today: the person leaves the roster, the history stays. */
  async close(a: AuthContext, id: string): Promise<EnrollmentOut> {
    const i = await this.open(id);
    i.endedAt = new Date().toISOString().slice(0, 10);
    await this.em.flush();
    await this.audit.register({ action: AuditAction.ENROLLMENT_CLOSED, userId: a.userId, clubId: a.clubId, entity: 'Enrollment', entityId: i.id });
    return this.outComplete(i);
  }

  /** An enrollment can be touched only if the season is not closed and the enrollment is still open. */
  private async open(id: string): Promise<Enrollment> {
    const i = await this.em.findOne(Enrollment, id, { populate: ['season'] });
    if (!i) throw new NotFoundException({ message: 'Enrollment not found', code: 'ENROLLMENT_NOT_FOUND' });
    if (!editable(i.season.status)) throw closedSeason();
    if (i.endedAt) throw closedEnrollment();
    return i;
  }

  private async season(id: string): Promise<Season> {
    const st = await this.em.findOne(Season, id);
    if (!st) throw new NotFoundException({ message: 'Season not found', code: 'SEASON_NOT_FOUND' });
    return st;
  }

  /** A new position must be in the sport profile. One already stored is not rechecked if unchanged. */
  private async checkPosition(seasonId: string, position: string | null | undefined) {
    if (position === undefined || position === null) return;
    if (!allowedPosition(position, await allowedPositions(this.em, seasonId))) throw new BadRequestException(ERRORS.INVALID_POSITION);
  }

  private check(d: EnrollmentData) {
    const e = validateEnrollment(d);
    if (e) throw new BadRequestException(ERRORS[e]);
  }

  private out(i: Enrollment): Omit<EnrollmentOut, 'seasonId' | 'endedAt'> {
    return {
      id: i.id,
      personId: i.person.id,
      type: i.type,
      staffRole: i.staffRole,
      position: i.position,
      jerseyNumber: i.jerseyNumber,
      status: i.status,
    };
  }

  private outComplete(i: Enrollment): EnrollmentOut {
    return enrollmentOut(i);
  }
}
