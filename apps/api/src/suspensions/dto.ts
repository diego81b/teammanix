import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { SuspensionForm } from '../entities/enums';

/**
 * A suspension, in one of its two forms. Which fields go with which form, that the strings are real days and that
 * everything fits the season is decided by `validateSuspension`. `null` and a missing key mean the same.
 */
export class SuspensionDto {
  @IsEnum(SuspensionForm)
  form!: SuspensionForm;

  /** Missing only when the suspension is born from a match: its day is used. */
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsInt()
  matchCount?: number | null;

  @IsOptional()
  @IsString()
  endDate?: string | null;

  /** Names given to the events, not checked against the ones that exist: a season carried over has no events yet. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(150, { each: true })
  competitions?: string[];
}

export class CreateSuspensionDto extends SuspensionDto {
  /** The match the suspension is born from: the count starts from the next one. */
  @IsOptional()
  @IsUUID()
  originEventId?: string;
}
