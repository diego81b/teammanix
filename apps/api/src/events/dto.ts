import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { EventType, HomeAway } from '../entities/enums';

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

  /** Opponent name: an existing one of the activity is reused, a new one is created. */
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
