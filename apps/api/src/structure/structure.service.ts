import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/auth-context';
import { Activity } from '../entities/activity.entity';
import { AuditAction, SeasonStatus } from '../entities/enums';
import { SportProfile } from '../entities/sport-profile.entity';
import { Team } from '../entities/team.entity';
import { Season } from '../entities/season.entity';
import type {
  CreateActivityDto,
  CreateTeamDto,
  CreateSeasonDto,
  EditActivityDto,
  EditTeamDto,
  EditSeasonDto,
} from './dto';
import { editable, periodValid, canActivate, canClose } from './season.rules';

/** Codes only: texts (sport, positions) are translated by the frontend. */
export interface SportProfileDto {
  code: string;
  positions: string[];
  starterBench: boolean;
  maxStarters: number | null;
  modulesAvailable: string[];
}

export interface ActivityDto {
  id: string;
  name: string;
  sportProfile: string;
  modulesActive: string[];
}

export interface TeamDto {
  id: string;
  activityId: string;
  name: string;
  category: string | null;
  gender: string | null;
}

export interface SeasonDto {
  id: string;
  teamId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
  league: string | null;
}

export const draftExists = () =>
  new ConflictException({ message: 'The team already has a draft season', code: 'DRAFT_EXISTS' });

export function toSeasonDto(s: Season): SeasonDto {
  return {
    id: s.id,
    teamId: s.team.id,
    name: s.name,
    startDate: s.startDate,
    endDate: s.endDate,
    status: s.status,
    league: s.league,
  };
}

export type StructureTree = (ActivityDto & { teams: (TeamDto & { seasons: SeasonDto[] })[] })[];

@Injectable()
export class StructureService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
  ) {}

  async profiles(): Promise<SportProfileDto[]> {
    const profiles = await this.em.find(SportProfile, {}, { orderBy: { code: 'asc' } });
    return profiles.map((p) => ({
      code: p.code,
      positions: p.positions,
      starterBench: p.starterBench,
      maxStarters: p.maxStarters,
      modulesAvailable: p.modulesAvailable,
    }));
  }

  async tree(): Promise<StructureTree> {
    const [activity, teams, seasons] = await Promise.all([
      this.em.find(Activity, {}, { populate: ['sportProfile'], orderBy: { name: 'asc' } }),
      this.em.find(Team, {}, { orderBy: { name: 'asc' } }),
      this.em.find(Season, {}, { orderBy: { startDate: 'desc' } }),
    ]);
    return activity.map((a) => ({
      ...this.activityDto(a),
      teams: teams
        .filter((s) => s.activity.id === a.id)
        .map((s) => ({
          ...this.teamDto(s),
          seasons: seasons.filter((st) => st.team.id === s.id).map((st) => this.seasonDto(st)),
        })),
    }));
  }

  async createActivity(a: AuthContext, dto: CreateActivityDto): Promise<ActivityDto> {
    const profile = await this.em.findOne(SportProfile, { code: dto.sportProfile });
    if (!profile) throw new BadRequestException({ message: 'Invalid sport profile', code: 'INVALID_SPORT_PROFILE' });
    const modules = dto.modulesActive ?? profile.modulesAvailable;
    this.checkModules(modules, profile);
    const act = this.em.create(Activity, {
      club: a.clubId as string,
      name: dto.name,
      sportProfile: profile,
      modulesActive: modules,
    });
    await this.save({ message: 'An activity with this name already exists', code: 'ACTIVITY_EXISTS' });
    return this.activityDto(act);
  }

  async editActivity(id: string, dto: EditActivityDto): Promise<ActivityDto> {
    const act = await this.em.findOne(Activity, id, { populate: ['sportProfile'] });
    if (!act) throw new NotFoundException({ message: 'Activity not found', code: 'ACTIVITY_NOT_FOUND' });
    if (dto.modulesActive) {
      this.checkModules(dto.modulesActive, act.sportProfile);
      act.modulesActive = dto.modulesActive;
    }
    if (dto.name) act.name = dto.name;
    await this.save({ message: 'An activity with this name already exists', code: 'ACTIVITY_EXISTS' });
    return this.activityDto(act);
  }

  async createTeam(a: AuthContext, activityId: string, dto: CreateTeamDto): Promise<TeamDto> {
    const act = await this.em.findOne(Activity, activityId);
    if (!act) throw new NotFoundException({ message: 'Activity not found', code: 'ACTIVITY_NOT_FOUND' });
    const sq = this.em.create(Team, {
      club: a.clubId as string,
      activity: act,
      name: dto.name,
      category: dto.category ?? null,
      gender: dto.gender ?? null,
    });
    await this.save({ message: 'A team with this name already exists in this activity', code: 'TEAM_EXISTS' });
    return this.teamDto(sq);
  }

  async editTeam(id: string, dto: EditTeamDto): Promise<TeamDto> {
    const sq = await this.em.findOne(Team, id);
    if (!sq) throw new NotFoundException({ message: 'Team not found', code: 'TEAM_NOT_FOUND' });
    if (dto.name) sq.name = dto.name;
    if (dto.category !== undefined) sq.category = dto.category;
    if (dto.gender !== undefined) sq.gender = dto.gender;
    await this.save({ message: 'A team with this name already exists in this activity', code: 'TEAM_EXISTS' });
    return this.teamDto(sq);
  }

  async createSeason(a: AuthContext, teamId: string, dto: CreateSeasonDto): Promise<SeasonDto> {
    const sq = await this.em.findOne(Team, teamId);
    if (!sq) throw new NotFoundException({ message: 'Team not found', code: 'TEAM_NOT_FOUND' });
    this.checkPeriod(dto.startDate, dto.endDate);
    // One draft per team: the DB unique index also settles the race between two requests.
    if ((await this.em.count(Season, { team: sq.id, status: SeasonStatus.DRAFT })) > 0) throw draftExists();
    const st = this.em.create(Season, {
      club: a.clubId as string,
      team: sq,
      name: dto.name,
      startDate: dto.startDate,
      endDate: dto.endDate,
      status: SeasonStatus.DRAFT,
      league: dto.league ?? null,
    });
    try {
      await this.em.flush();
    } catch (e) {
      if (e instanceof UniqueConstraintViolationException) throw draftExists();
      throw e;
    }
    return this.seasonDto(st);
  }

  async editSeason(id: string, dto: EditSeasonDto): Promise<SeasonDto> {
    const st = await this.season(id);
    if (!editable(st.status)) throw new ConflictException({ message: 'The season is closed', code: 'SEASON_CLOSED' });
    const start = dto.startDate ?? st.startDate;
    const end = dto.endDate ?? st.endDate;
    this.checkPeriod(start, end);
    if (dto.name) st.name = dto.name;
    if (dto.league !== undefined) st.league = dto.league;
    st.startDate = start;
    st.endDate = end;
    await this.em.flush();
    return this.seasonDto(st);
  }

  /** One active season per team (rule 1): the DB unique index also settles the race between two requests. */
  async activeSeason(id: string): Promise<SeasonDto> {
    const st = await this.season(id);
    if (!canActivate(st.status)) throw new ConflictException({ message: 'Only a draft can be activated', code: 'SEASON_NOT_ACTIVATABLE' });
    const exists = await this.em.count(Season, { team: st.team.id, status: SeasonStatus.ACTIVE });
    if (exists > 0) throw new ConflictException({ message: 'The team already has an active season', code: 'ACTIVE_SEASON_EXISTS' });
    st.status = SeasonStatus.ACTIVE;
    await this.save({ message: 'The team already has an active season', code: 'ACTIVE_SEASON_EXISTS' });
    return this.seasonDto(st);
  }

  /**
   * Rule 8, first step. Enrollments stay as they were: the roster of a closed season is the end-of-season one.
   * The new season is then prepared with guided cloning (`CloningService`).
   */
  async closeSeason(a: AuthContext, id: string): Promise<SeasonDto> {
    const st = await this.season(id);
    if (!canClose(st.status)) throw new ConflictException({ message: 'Only an active season can be closed', code: 'SEASON_NOT_CLOSABLE' });
    st.status = SeasonStatus.CLOSED;
    await this.em.flush();
    await this.audit.register({ action: AuditAction.SEASON_CLOSED, userId: a.userId, clubId: a.clubId, entity: 'Season', entityId: st.id });
    return this.seasonDto(st);
  }

  private async season(id: string): Promise<Season> {
    const st = await this.em.findOne(Season, id);
    if (!st) throw new NotFoundException({ message: 'Season not found', code: 'SEASON_NOT_FOUND' });
    return st;
  }

  private checkModules(modules: string[], profile: SportProfile) {
    if (modules.some((m) => !profile.modulesAvailable.includes(m))) {
      throw new BadRequestException({ message: 'Module not available for this profile', code: 'INVALID_MODULES' });
    }
  }

  private checkPeriod(start: string, end: string) {
    if (!periodValid(start, end)) throw new BadRequestException({ message: 'Invalid period', code: 'INVALID_DATE_SEASON' });
  }

  /** A duplicate (even from concurrent requests) becomes a 409 with a stable code. */
  private async save(conflict: { message: string; code: string }) {
    try {
      await this.em.flush();
    } catch (e) {
      if (e instanceof UniqueConstraintViolationException) throw new ConflictException(conflict);
      throw e;
    }
  }

  private activityDto(a: Activity): ActivityDto {
    return { id: a.id, name: a.name, sportProfile: a.sportProfile.code, modulesActive: a.modulesActive };
  }
  private teamDto(s: Team): TeamDto {
    return { id: s.id, activityId: s.activity.id, name: s.name, category: s.category, gender: s.gender };
  }
  private seasonDto(s: Season): SeasonDto {
    return toSeasonDto(s);
  }
}
