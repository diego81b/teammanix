import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EventType, HomeAway } from '../entities/enums';
import { MAX_DURATION_MINUTES, MAX_INTERVAL_WEEKS, WEEKDAYS } from './series.rules';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Instants are ISO datetimes with `Z` or an offset: `parseInstant` checks them (real calendar), here only the type.
 * On the edit DTOs `null` clears a field (`IsOptional` lets null through) and a missing key leaves it as it is.
 */
export class CreateEventDto {
  @IsEnum(EventType)
  type!: EventType;

  @IsString()
  @MaxLength(40)
  start!: string;

  @IsString()
  @MaxLength(40)
  end!: string;

  @IsOptional()
  @Transform(trim)
  @Length(1, 150)
  title?: string;

  @IsOptional()
  @IsUUID()
  venueId?: string;

  @IsOptional()
  @Transform(trim)
  @Length(1, 2000)
  note?: string;

  /** Opponent name: an existing one of the team is reused, a new one is created. */
  @IsOptional()
  @Transform(trim)
  @Length(1, 150)
  opponent?: string;

  @IsOptional()
  @IsEnum(HomeAway)
  homeAway?: HomeAway;

  @IsOptional()
  @Transform(trim)
  @Length(1, 150)
  competition?: string;
}

export class EditEventDto {
  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  start?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  end?: string;

  @IsOptional()
  @Transform(trim)
  @Length(1, 150)
  title?: string | null;

  @IsOptional()
  @IsUUID()
  venueId?: string | null;

  @IsOptional()
  @Transform(trim)
  @Length(1, 2000)
  note?: string | null;

  @IsOptional()
  @Transform(trim)
  @Length(1, 150)
  opponent?: string | null;

  @IsOptional()
  @IsEnum(HomeAway)
  homeAway?: HomeAway | null;

  @IsOptional()
  @Transform(trim)
  @Length(1, 150)
  competition?: string | null;
}

export class CreateVenueDto {
  @Transform(trim)
  @Length(1, 150)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @Length(1, 300)
  address?: string;
}

export class EditVenueDto {
  @IsOptional()
  @Transform(trim)
  @Length(1, 150)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @Length(1, 300)
  address?: string | null;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A series is for trainings and other events: a match needs its own opponent, so it is always planned one by one. */
const SERIES_TYPES = [EventType.TRAINING, EventType.OTHER];

/**
 * Days are local calendar days `YYYY-MM-DD` and the time is the local wall clock: `parseDate` in the service checks the calendar.
 * `endDate` missing means the end of the season.
 */
export class CreateSeriesDto {
  @IsIn(SERIES_TYPES)
  type!: EventType;

  @IsOptional()
  @Transform(trim)
  @Length(1, 150)
  title?: string;

  @IsOptional()
  @IsUUID()
  venueId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(WEEKDAYS.length)
  @ArrayUnique()
  @IsIn(WEEKDAYS, { each: true })
  weekdays!: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INTERVAL_WEEKS)
  intervalWeeks?: number;

  @IsString()
  @MaxLength(10)
  startDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  endDate?: string;

  @Matches(TIME)
  timeStart!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_DURATION_MINUTES)
  durationMinutes!: number;
}

/** "All future ones": what the series changes for. The type and the start date stay as they were. `null` clears title, venue and end date. */
export class EditSeriesDto {
  @IsOptional()
  @Transform(trim)
  @Length(1, 150)
  title?: string | null;

  @IsOptional()
  @IsUUID()
  venueId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(WEEKDAYS.length)
  @ArrayUnique()
  @IsIn(WEEKDAYS, { each: true })
  weekdays?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INTERVAL_WEEKS)
  intervalWeeks?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  endDate?: string | null;

  @IsOptional()
  @Matches(TIME)
  timeStart?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DURATION_MINUTES)
  durationMinutes?: number;
}
