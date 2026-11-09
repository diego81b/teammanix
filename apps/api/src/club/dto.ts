import { Transform } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, Equals, IsArray, IsBoolean, IsEnum, IsOptional, Length } from 'class-validator';
import { StaffRole } from '../entities/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateClubDto {
  @Transform(trim)
  @Length(2, 200)
  name!: string;

  /** Acceptance of the DPA under art. 28 GDPR on behalf of the club that owns the data. */
  @IsBoolean()
  @Equals(true, { message: 'You must accept the DPA (appointment as data processor)' })
  acceptDpa!: boolean;
}

export class EditSettingsDto {
  @IsOptional()
  @IsBoolean()
  certificatesWithFile?: boolean;

  @IsOptional()
  @IsBoolean()
  blockCertificateExpired?: boolean;

  @IsOptional()
  @IsBoolean()
  warnNoCoachAvailable?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(StaffRole, { each: true })
  coachRoles?: StaffRole[];
}
