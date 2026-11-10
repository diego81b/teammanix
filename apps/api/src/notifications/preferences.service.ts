import { EntityManager } from '@mikro-orm/postgresql';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { MembershipsService } from '../auth/memberships.service';
import type { AuthContext } from '../common/auth-context';
import { NotificationPreference } from '../entities/notification-preference.entity';
import type { PreferenceDto } from './dto';

export interface PreferenceOut {
  clubId: string;
  name: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
}

/**
 * The account's choices, one per club it belongs to (ANALISI rule 6). The entity has no tenant: the person manages
 * them all from one screen, so every query filters by user.
 * A club without a stored row shows every channel on, which is what the sending assumes.
 */
@Injectable()
export class PreferencesService {
  constructor(
    private readonly em: EntityManager,
    private readonly memberships: MembershipsService,
  ) {}

  async list(a: AuthContext): Promise<PreferenceOut[]> {
    const [clubs, rows] = await Promise.all([this.memberships.list(a.userId), this.em.find(NotificationPreference, { user: a.userId })]);
    const byClub = new Map(rows.map((r) => [r.club.id, r]));
    return clubs.map((c) => {
      const p = byClub.get(c.clubId);
      return { clubId: c.clubId, name: c.name, inApp: p?.inApp ?? true, email: p?.email ?? true, push: p?.push ?? true };
    });
  }

  async save(a: AuthContext, clubId: string, dto: PreferenceDto): Promise<PreferenceOut> {
    const clubs = await this.memberships.list(a.userId);
    const club = clubs.find((c) => c.clubId === clubId);
    if (!club) throw new ForbiddenException({ message: 'You do not belong to this club', code: 'NOT_CLUB_MEMBER' });
    const row = (await this.em.findOne(NotificationPreference, { user: a.userId, club: clubId })) ?? this.em.create(NotificationPreference, { user: a.userId, club: clubId, ...dto });
    row.inApp = dto.inApp;
    row.email = dto.email;
    row.push = dto.push;
    await this.em.flush();
    return { clubId, name: club.name, inApp: row.inApp, email: row.email, push: row.push };
  }
}
