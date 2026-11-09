import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { Club } from '../entities/club.entity';
import type { StaffRole } from '../entities/enums';
import type { EditSettingsDto } from './dto';

export interface SettingsDto {
  /** The club may keep the medical certificate file (by default only type, issue and expiry). */
  certificatesWithFile: boolean;
  /** Expired or missing certificate: the player cannot be called up. */
  blockCertificateExpired: boolean;
  /** Staff are warned when no coach has declared available for an event. */
  warnNoCoachAvailable: boolean;
  /** Staff roles that count as a coach for that warning. */
  coachRoles: StaffRole[];
}

@Injectable()
export class SettingsService {
  constructor(private readonly em: EntityManager) {}

  async read(a: AuthContext): Promise<SettingsDto> {
    return this.dto(await this.em.findOneOrFail(Club, a.clubId as string));
  }

  async edit(a: AuthContext, dto: EditSettingsDto): Promise<SettingsDto> {
    if (dto.certificatesWithFile === undefined && dto.blockCertificateExpired === undefined && dto.warnNoCoachAvailable === undefined && dto.coachRoles === undefined) {
      throw new BadRequestException({ message: 'No setting to modify', code: 'INVALID_DATA' });
    }
    const s = await this.em.findOneOrFail(Club, a.clubId as string);
    s.certificatesWithFile = dto.certificatesWithFile ?? s.certificatesWithFile;
    s.blockCertificateExpired = dto.blockCertificateExpired ?? s.blockCertificateExpired;
    s.warnNoCoachAvailable = dto.warnNoCoachAvailable ?? s.warnNoCoachAvailable;
    s.coachRoles = dto.coachRoles ?? s.coachRoles;
    await this.em.flush();
    return this.dto(s);
  }

  private dto(s: Club): SettingsDto {
    return {
      certificatesWithFile: s.certificatesWithFile,
      blockCertificateExpired: s.blockCertificateExpired,
      warnNoCoachAvailable: s.warnNoCoachAvailable,
      coachRoles: s.coachRoles,
    };
  }
}
