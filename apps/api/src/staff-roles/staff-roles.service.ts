import { ForeignKeyConstraintViolationException, UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { Enrollment } from '../entities/enrollment.entity';
import type { StaffPolicyModel } from '../entities/enums';
import { SportProfile, type SuggestedStaffRole } from '../entities/sport-profile.entity';
import { StaffRole } from '../entities/staff-role.entity';
import type { AddSuggestedStaffRolesDto, CreateStaffRoleDto, EditStaffRoleDto } from './dto';
import { nameKey, usableForNewEnrollment } from './staff-role.rules';

export interface StaffRoleDto {
  id: string;
  name: string;
  policyModel: StaffPolicyModel;
  mustBeAvailable: boolean;
  archived: boolean;
}

/** How an enrollment, a roster row or an attendance list names the role: the id to preselect and the name to show. */
export interface StaffRoleRef {
  id: string;
  name: string;
}

export const staffRoleRef = (r: { id: string; name: string } | null): StaffRoleRef | null => (r ? { id: r.id, name: r.name } : null);

const notFound = () => new NotFoundException({ message: 'Staff role not found', code: 'STAFF_ROLE_NOT_FOUND' });
const exists = () => new ConflictException({ message: 'A staff role with this name already exists', code: 'STAFF_ROLE_EXISTS' });
const inUse = () => new ConflictException({ message: 'The staff role is in use: archive it instead', code: 'STAFF_ROLE_IN_USE' });

/**
 * The role an enrollment may take: one of the club (the tenant filter scopes the lookup) and not archived. Used by every
 * path that sets a role on an enrollment.
 */
export async function usableStaffRole(em: EntityManager, id: string): Promise<StaffRole> {
  const role = await em.findOne(StaffRole, id);
  if (!role || !usableForNewEnrollment(role)) throw notFound();
  return role;
}

@Injectable()
export class StaffRolesService {
  constructor(private readonly em: EntityManager) {}

  /** The whole catalog, archived roles included (the enrollments that still have them need the name). */
  async list(): Promise<StaffRoleDto[]> {
    const roles = await this.em.find(StaffRole, {}, { orderBy: { createdAt: 'asc', name: 'asc' } });
    return roles.map(toDto);
  }

  async create(a: AuthContext, dto: CreateStaffRoleDto): Promise<StaffRoleDto> {
    const role = this.em.create(StaffRole, {
      club: a.clubId as string,
      name: dto.name,
      nameKey: nameKey(dto.name),
      policyModel: dto.policyModel,
      mustBeAvailable: dto.mustBeAvailable ?? false,
    });
    await this.save();
    return toDto(role);
  }

  /**
   * The roles of the sport profile the admin chose, with the model and the flag of the profile. A name the club already
   * has (case, accents and archived roles included) is skipped, so repeating the request adds nothing.
   */
  async addSuggested(a: AuthContext, dto: AddSuggestedStaffRolesDto): Promise<StaffRoleDto[]> {
    const profile = await this.em.findOne(SportProfile, { code: dto.sportProfile });
    if (!profile) throw new BadRequestException({ message: 'Invalid sport profile', code: 'INVALID_SPORT_PROFILE' });
    const suggested = new Map(profile.suggestedStaffRoles.map((r) => [r.code, r]));
    if (dto.roles.some((r) => !suggested.has(r.code))) {
      throw new BadRequestException({ message: 'A role is not suggested by the sport profile', code: 'INVALID_DATA' });
    }
    const taken = new Set((await this.em.find(StaffRole, {})).map((r) => r.nameKey));
    const created: StaffRole[] = [];
    for (const r of dto.roles) {
      const key = nameKey(r.name);
      if (taken.has(key)) continue;
      taken.add(key);
      const model = suggested.get(r.code) as SuggestedStaffRole;
      created.push(
        this.em.create(StaffRole, { club: a.clubId as string, name: r.name, nameKey: key, policyModel: model.policyModel, mustBeAvailable: model.mustBeAvailable }),
      );
    }
    await this.save();
    return created.map(toDto);
  }

  async edit(id: string, dto: EditStaffRoleDto): Promise<StaffRoleDto> {
    if (dto.name === undefined && dto.policyModel === undefined && dto.mustBeAvailable === undefined && dto.archived === undefined) {
      throw new BadRequestException({ message: 'No field to modify', code: 'INVALID_DATA' });
    }
    const role = await this.em.findOne(StaffRole, id);
    if (!role) throw notFound();
    if (dto.name !== undefined) {
      role.name = dto.name;
      role.nameKey = nameKey(dto.name);
    }
    if (dto.policyModel !== undefined) role.policyModel = dto.policyModel;
    if (dto.mustBeAvailable !== undefined) role.mustBeAvailable = dto.mustBeAvailable;
    if (dto.archived !== undefined) role.archivedAt = dto.archived ? (role.archivedAt ?? new Date()) : null;
    await this.save();
    return toDto(role);
  }

  /** Only a role no enrollment has, closed ones included: otherwise the history would lose the name. */
  async remove(id: string): Promise<void> {
    const role = await this.em.findOne(StaffRole, id);
    if (!role) throw notFound();
    if ((await this.em.count(Enrollment, { staffRole: role.id })) > 0) throw inUse();
    try {
      await this.em.nativeDelete(StaffRole, { id: role.id });
    } catch (e) {
      // An enrollment created between the check and the delete: the foreign key refuses it.
      if (e instanceof ForeignKeyConstraintViolationException) throw inUse();
      throw e;
    }
  }

  private async save() {
    try {
      await this.em.flush();
    } catch (e) {
      if (e instanceof UniqueConstraintViolationException) throw exists();
      throw e;
    }
  }
}

function toDto(r: StaffRole): StaffRoleDto {
  return { id: r.id, name: r.name, policyModel: r.policyModel, mustBeAvailable: r.mustBeAvailable, archived: r.archivedAt !== null };
}
