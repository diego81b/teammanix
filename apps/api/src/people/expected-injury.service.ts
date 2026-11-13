import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/auth-context';
import { AuditAction, EnrollmentType } from '../entities/enums';
import { Enrollment } from '../entities/enrollment.entity';
import { ExpectedInjury } from '../entities/expected-injury.entity';
import { AuthorizationsService } from '../permissions/authorizations.service';
import { editable } from '../structure/season.rules';
import type { ExpectedInjuryDto } from './dto-admin';
import { type ExpectedPeriod, validateExpected } from './expected-injury.rules';

export interface ExpectedInjuryOut extends ExpectedPeriod {
  enrollmentId: string;
}

const notFound = () => new NotFoundException({ message: 'Enrollment not found', code: 'ENROLLMENT_NOT_FOUND' });
const invalid = () => new BadRequestException({ message: 'Invalid data', code: 'INVALID_DATA' });

/**
 * Probably injured. Staff with `people.manage` in the team of a player enrollment record when they expect the player
 * out; the period then reaches the person in every open player enrollment, as the injured state does. Dates only.
 */
@Injectable()
export class ExpectedInjuryService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
    private readonly authz: AuthorizationsService,
  ) {}

  async set(a: AuthContext, enrollmentId: string, dto: ExpectedInjuryDto): Promise<ExpectedInjuryOut> {
    const e = await this.writable(a, enrollmentId);
    const p = { startDate: dto.startDate, returnDate: dto.returnDate };
    if (e.type !== EnrollmentType.PLAYER || validateExpected(p) !== 'ok') throw invalid();
    const row = await this.em.findOne(ExpectedInjury, { enrollment: e.id });
    if (row) Object.assign(row, p);
    else this.em.create(ExpectedInjury, { club: a.clubId as string, enrollment: e, ...p });
    await this.em.flush();
    await this.audit.register({
      action: row ? AuditAction.EXPECTED_INJURY_MODIFIED : AuditAction.EXPECTED_INJURY_CREATED,
      userId: a.userId,
      clubId: a.clubId,
      entity: 'Enrollment',
      entityId: e.id,
      meta: p,
    });
    return { enrollmentId: e.id, ...p };
  }

  /** Ends the period, whatever its dates. Nothing to end is not an error. */
  async end(a: AuthContext, enrollmentId: string): Promise<void> {
    const e = await this.writable(a, enrollmentId);
    const row = await this.em.findOne(ExpectedInjury, { enrollment: e.id });
    if (!row) return;
    this.em.remove(row);
    await this.em.flush();
    await this.audit.register({ action: AuditAction.EXPECTED_INJURY_ENDED, userId: a.userId, clubId: a.clubId, entity: 'Enrollment', entityId: e.id });
  }

  private async writable(a: AuthContext, enrollmentId: string): Promise<Enrollment> {
    if (!(await this.authz.sees(a, { enrollmentId }))) throw notFound();
    await this.authz.request(a, 'people.manage', { enrollmentId });
    const e = await this.em.findOne(Enrollment, enrollmentId, { populate: ['season'] });
    if (!e) throw notFound();
    if (!editable(e.season.status)) throw new ConflictException({ message: 'The season is closed', code: 'SEASON_CLOSED' });
    if (e.endedAt) throw new ConflictException({ message: 'The enrollment is closed', code: 'ENROLLMENT_CLOSED' });
    return e;
  }
}
