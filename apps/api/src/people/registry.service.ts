import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CertificatesService, type SummaryCertificate } from '../certificates/certificates.service';
import type { AuthContext } from '../common/auth-context';
import { AuditAction, AccessRoleType, ScopeType, EnrollmentType } from '../entities/enums';
import { Enrollment } from '../entities/enrollment.entity';
import { Person } from '../entities/person.entity';
import { AccessRole } from '../entities/access-role.entity';
import { type StaffRoleRef, staffRoleRef } from '../staff-roles/staff-roles.service';
import { validIsoDate } from '../structure/season.rules';
import type { CreatePersonDto } from './dto-admin';

export interface PersonDto {
  id: string;
  name: string;
  surname: string | null;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  toComplete: boolean;
  disabled: boolean;
}

export interface EnrollmentPersonDto {
  id: string;
  seasonId: string;
  season: string;
  teamId: string;
  team: string;
  /** Null for a team outside any section. */
  section: string | null;
  type: EnrollmentType;
  staffRole: StaffRoleRef | null;
  position: string | null;
  jerseyNumber: number | null;
  status: string;
  endedAt: string | null;
}

const notFound = () => new NotFoundException({ message: 'Person not found', code: 'PERSON_NOT_FOUND' });

/** Management of records by admins. The person's own record is in PeopleService. */
@Injectable()
export class RegistryService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
    private readonly certificates: CertificatesService,
  ) {}

  async create(a: AuthContext, dto: CreatePersonDto): Promise<PersonDto> {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException({ message: 'Provide at least one contact: email or phone', code: 'CONTACT_REQUIRED' });
    }
    if (dto.birthDate !== undefined) {
      const future = validIsoDate(dto.birthDate) && new Date(`${dto.birthDate}T00:00:00Z`).getTime() > Date.now();
      if (!validIsoDate(dto.birthDate) || future || dto.birthDate < '1900-01-01') {
        throw new BadRequestException({ message: 'Invalid birth date', code: 'INVALID_BIRTH_DATE' });
      }
    }
    const complete = !!dto.surname && !!dto.birthDate;
    const p = this.em.create(Person, {
      club: a.clubId as string,
      name: dto.name,
      surname: dto.surname ?? null,
      birthDate: dto.birthDate ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      completedAt: complete ? new Date() : null,
    });
    await this.em.flush();
    return this.dto(p);
  }

  /** Disabled people never appear here: they have their own archive. */
  async list(q?: string): Promise<PersonDto[]> {
    const t = q?.trim();
    const pattern = t ? `%${t.replace(/[\\%_]/g, '\\$&')}%` : null;
    const people = await this.em.find(
      Person,
      {
        disabledAt: null,
        ...(pattern ? { $or: [{ name: { $ilike: pattern } }, { surname: { $ilike: pattern } }, { email: { $ilike: pattern } }] } : {}),
      },
      { orderBy: { surname: 'asc', name: 'asc' }, limit: 200 },
    );
    return people.map((p) => this.dto(p));
  }

  /** Disabled people, deleted ones excluded. */
  async disabled(): Promise<PersonDto[]> {
    const people = await this.em.find(Person, { disabledAt: { $ne: null }, anonymizedAt: null }, { orderBy: { disabledAt: 'desc' }, limit: 200 });
    return people.map((p) => this.dto(p));
  }

  async detail(id: string): Promise<PersonDto & { certificate: SummaryCertificate | null; enrollments: EnrollmentPersonDto[] }> {
    const p = await this.em.findOne(Person, { id, anonymizedAt: null });
    if (!p) throw notFound();
    const enrollments = await this.em.find(
      Enrollment,
      { person: id },
      { populate: ['season.team.section', 'staffRole'], orderBy: { season: { startDate: 'desc' } } },
    );
    // Rule 11: staff-only people have no certificate.
    const onlyStaff = enrollments.length > 0 && enrollments.every((i) => i.type === EnrollmentType.STAFF);
    const certificate = onlyStaff ? null : ((await this.certificates.summary([id])).get(id) ?? null);
    return {
      ...this.dto(p),
      certificate,
      enrollments: enrollments.map((i) => ({
        id: i.id,
        seasonId: i.season.id,
        season: i.season.name,
        teamId: i.season.team.id,
        team: i.season.team.name,
        section: i.season.team.section?.name ?? null,
        type: i.type,
        staffRole: staffRoleRef(i.staffRole),
        position: i.position,
        jerseyNumber: i.jerseyNumber,
        status: i.status,
        endedAt: i.endedAt,
      })),
    };
  }

  /**
   * Rule 12. Applies to the whole club: the record and history stay, but the person disappears from lists and their
   * account loses access (the guard rereads the person on every request). The last admin cannot be disabled.
   */
  async disable(a: AuthContext, id: string): Promise<PersonDto> {
    const clubId = a.clubId as string;
    const p = await this.em.transactional(async (tem) => {
      // Lock on admins: two admins disabling each other in parallel must not both pass the check.
      const admin = await tem.find(
        AccessRole,
        { club: clubId, role: AccessRoleType.ADMIN, scope: ScopeType.CLUB },
        { filters: false, lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      const person = await tem.findOne(Person, { id, club: clubId }, { filters: false });
      if (!person) throw notFound();
      if (person.disabledAt) {
        throw new ConflictException({ message: 'The person is already disabled', code: 'PERSON_ALREADY_DISABLED' });
      }
      const userId = person.user?.id;
      if (userId && admin.some((r) => r.user.id === userId)) {
        const disabled = await tem.find(
          Person,
          { club: clubId, disabledAt: { $ne: null }, user: { $in: admin.map((r) => r.user.id) } },
          { filters: false },
        );
        const outside = new Set([userId, ...disabled.map((d) => d.user!.id)]);
        if (admin.every((r) => outside.has(r.user.id))) {
          throw new ConflictException({ message: 'Cannot disable the last admin', code: 'LAST_ADMIN' });
        }
      }
      person.disabledAt = new Date();
      return person;
    });
    await this.audit.register({ action: AuditAction.PERSON_DISABLED, userId: a.userId, clubId, entity: 'Person', entityId: id });
    return this.dto(p);
  }

  async reenable(a: AuthContext, id: string): Promise<PersonDto> {
    const p = await this.em.findOne(Person, { id, anonymizedAt: null });
    if (!p) throw notFound();
    if (!p.disabledAt) throw new ConflictException({ message: 'The person is not disabled', code: 'PERSON_NOT_DISABLED' });
    p.disabledAt = null;
    await this.em.flush();
    await this.audit.register({ action: AuditAction.PERSON_REENABLED, userId: a.userId, clubId: a.clubId, entity: 'Person', entityId: id });
    return this.dto(p);
  }

  private dto(p: Person): PersonDto {
    return {
      id: p.id,
      name: p.name,
      surname: p.surname,
      birthDate: p.birthDate,
      email: p.email,
      phone: p.phone,
      toComplete: !p.completedAt,
      disabled: !!p.disabledAt,
    };
  }
}
