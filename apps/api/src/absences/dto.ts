import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * A period of absence. `endDate` missing or null means "until further notice". That the strings are real days, that the
 * end does not precede the start and that the period fits the season is decided by `validatePeriod`.
 */
export class AbsenceDto {
  @IsString()
  startDate!: string;

  @IsOptional()
  @IsString()
  endDate?: string | null;
}

/** The events the person chose to decline, nothing more is ever declined for them. */
export class DeclineDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  eventIds!: string[];
}
