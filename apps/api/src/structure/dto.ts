import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { TeamGender } from '../entities/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateActivityDto {
  @Transform(trim)
  @Length(1, 100)
  name!: string;

  /** Stable code of the sport profile (for example 'calcio'). */
  @IsString()
  @MaxLength(40)
  sportProfile!: string;

  /** Default: all the profile's modules. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  modulesActive?: string[];
}

export class EditActivityDto {
  @IsOptional()
  @Transform(trim)
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  modulesActive?: string[];
}

export class CreateTeamDto {
  @Transform(trim)
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @Length(1, 60)
  category?: string;

  @IsOptional()
  @IsEnum(TeamGender)
  gender?: TeamGender;
}

export class EditTeamDto {
  @IsOptional()
  @Transform(trim)
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @Length(1, 60)
  category?: string;

  @IsOptional()
  @IsEnum(TeamGender)
  gender?: TeamGender;
}

/** Dates are checked by `periodValid` (real calendar), here only the type. */
export class CreateSeasonDto {
  @Transform(trim)
  @Length(1, 60)
  name!: string;

  @IsString()
  @MaxLength(10)
  startDate!: string;

  @IsString()
  @MaxLength(10)
  endDate!: string;

  @IsOptional()
  @Transform(trim)
  @Length(1, 150)
  league?: string;
}

export class EditSeasonDto {
  @IsOptional()
  @Transform(trim)
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  endDate?: string;

  @IsOptional()
  @Transform(trim)
  @Length(1, 150)
  league?: string;
}
