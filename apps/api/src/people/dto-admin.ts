import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { EnrollmentStatus, EnrollmentType } from '../entities/enums';
import { CreateSeasonDto } from '../structure/dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lowercase = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** Record created by an admin. With surname and birth date it is complete, otherwise to be completed. */
export class CreatePersonDto {
  @Transform(trim)
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @Length(1, 100)
  surname?: string;

  /** The check that it is a real, non-future date is in the service. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  birthDate?: string;

  @IsOptional()
  @Transform(lowercase)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @Transform(trim)
  @Length(5, 30)
  phone?: string;
}

export class SearchPeopleDto {
  @IsOptional()
  @Transform(trim)
  @MaxLength(100)
  q?: string;
}

export class EnrollmentDto {
  @IsUUID()
  personId!: string;

  @IsEnum(EnrollmentType)
  type!: EnrollmentType;

  /** A role of the club's catalog: not archived, not of another club (STAFF_ROLE_NOT_FOUND). */
  @IsOptional()
  @IsUUID()
  staffRoleId?: string;

  @IsOptional()
  @Transform(trim)
  @Length(1, 40)
  position?: string;

  /** Range and integrality are checked in `validateEnrollment`, to give a precise code. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value))
  @IsInt()
  jerseyNumber?: number;
}

export class EditEnrollmentDto {
  /** A role of the club's catalog: not archived, not of another club (STAFF_ROLE_NOT_FOUND). */
  @IsOptional()
  @IsUUID()
  staffRoleId?: string;

  @IsOptional()
  @Transform(trim)
  @Length(1, 40)
  position?: string;

  @IsOptional()
  @IsInt()
  jerseyNumber?: number;

  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;
}

/** Status of a player enrollment, set by staff with `people.manage`. Nothing else can travel on this route. */
export class EnrollmentStatusDto {
  @IsEnum(EnrollmentStatus)
  status!: EnrollmentStatus;
}

/** New season (draft) for the same team, plus the enrollments chosen from the origin's roster. */
export class CloneSeasonDto extends CreateSeasonDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  enrollments!: string[];

  /** Carries to the new season what is left of the suspensions by matches of the chosen enrollments (rule 13). Default false. */
  @IsOptional()
  @IsBoolean()
  carrySuspensions?: boolean;
}

/** Omitted fields are copied from the origin enrollment. */
export class PromoteEnrollmentDto {
  @IsUUID()
  seasonId!: string;

  /** Default false: the origin enrollment stays open (rule 9). */
  @IsOptional()
  @IsBoolean()
  closeSource?: boolean;

  /** A role of the club's catalog: not archived, not of another club (STAFF_ROLE_NOT_FOUND). */
  @IsOptional()
  @IsUUID()
  staffRoleId?: string;

  @IsOptional()
  @Transform(trim)
  @Length(1, 40)
  position?: string;

  @IsOptional()
  @IsInt()
  jerseyNumber?: number;
}

/** Expected injury: two days and nothing else. That they are real days in order is decided by `validateExpected`. */
export class ExpectedInjuryDto {
  @IsString()
  startDate!: string;

  @IsString()
  returnDate!: string;
}

/** Staff enrollment of one person in the open season of several teams at once. */
export class StaffEnrollmentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  teamIds!: string[];

  @IsUUID()
  staffRoleId!: string;
}
