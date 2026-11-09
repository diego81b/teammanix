import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { Opponent } from '../entities/opponent.entity';
import { Venue } from '../entities/venue.entity';
import { AuthorizationsService } from '../permissions/authorizations.service';
import type { CreateVenueDto, EditVenueDto } from './dto';
import { nameKey, normalizeName } from './event.rules';

export interface VenueDto {
  id: string;
  name: string;
  address: string | null;
}

export interface OpponentDto {
  id: string;
  name: string;
}

const venueExists = () => new ConflictException({ message: 'A venue with this name already exists', code: 'VENUE_EXISTS' });

const toVenueDto = (v: Venue): VenueDto => ({ id: v.id, name: v.name, address: v.address });

/** Venues belong to the club, opponents to the activity (unique name). Both are created where they are used. */
@Injectable()
export class CatalogService {
  constructor(
    private readonly em: EntityManager,
    private readonly authz: AuthorizationsService,
  ) {}

  /** Any member reads the venues: the coach needs them for the event form. */
  async venues(): Promise<VenueDto[]> {
    const rows = await this.em.find(Venue, {}, { orderBy: { name: 'asc' } });
    return rows.map(toVenueDto);
  }

  async createVenue(a: AuthContext, dto: CreateVenueDto): Promise<VenueDto> {
    await this.authz.request(a, 'events.manage', { club: true });
    const name = normalizeName(dto.name);
    await this.assertFreeVenueName(name, null);
    const v = this.em.create(Venue, { club: a.clubId as string, name, address: dto.address ? normalizeName(dto.address) : null });
    await this.saveVenue();
    return toVenueDto(v);
  }

  async editVenue(a: AuthContext, id: string, dto: EditVenueDto): Promise<VenueDto> {
    await this.authz.request(a, 'events.manage', { club: true });
    const v = await this.venue(id);
    if (dto.name !== undefined) {
      const name = normalizeName(dto.name);
      await this.assertFreeVenueName(name, v.id);
      v.name = name;
    }
    if (dto.address !== undefined) v.address = dto.address === null ? null : normalizeName(dto.address);
    await this.saveVenue();
    return toVenueDto(v);
  }

  /** A venue of the active club, or 404. */
  async venue(id: string): Promise<Venue> {
    const v = await this.em.findOne(Venue, { id });
    if (!v) throw new NotFoundException({ message: 'Venue not found', code: 'VENUE_NOT_FOUND' });
    return v;
  }

  async opponents(a: AuthContext, teamId: string): Promise<OpponentDto[]> {
    await this.authz.request(a, 'events.manage', { teamId });
    const target = await this.authz.target(a.clubId as string, { teamId });
    const rows = await this.em.find(Opponent, { activity: target.activityId as string }, { orderBy: { name: 'asc' } });
    return rows.map((o) => ({ id: o.id, name: o.name }));
  }

  /**
   * The opponent of the activity with this name (case, accents and spaces ignored), created if missing.
   * The DB unique index settles two requests creating it together: the loser reads the winner's row.
   */
  async opponent(clubId: string, activityId: string, raw: string): Promise<Opponent> {
    const name = normalizeName(raw);
    const key = nameKey(name);
    const find = async () => (await this.em.find(Opponent, { activity: activityId })).find((o) => nameKey(o.name) === key);
    const found = await find();
    if (found) return found;
    // A separate unit of work: a failed insert must not leave the request's own one in a broken state.
    const fork = this.em.fork();
    fork.create(Opponent, { club: clubId, activity: activityId, name });
    try {
      await fork.flush();
    } catch (e) {
      if (!(e instanceof UniqueConstraintViolationException)) throw e;
    }
    const created = await find();
    if (!created) throw new Error('Opponent not found after creation');
    return created;
  }

  private async assertFreeVenueName(name: string, exceptId: string | null) {
    const key = nameKey(name);
    const all = await this.em.find(Venue, {});
    if (all.some((v) => v.id !== exceptId && nameKey(v.name) === key)) throw venueExists();
  }

  private async saveVenue() {
    try {
      await this.em.flush();
    } catch (e) {
      if (e instanceof UniqueConstraintViolationException) throw venueExists();
      throw e;
    }
  }
}
