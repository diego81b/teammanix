import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { Language, InvitationRole, ScopeType } from '../entities/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lowercase = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class CreateInvitationDto {
  @Transform(lowercase)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsEnum(InvitationRole)
  role!: InvitationRole;

  /** Language of the email and of the invitation page. Default: the inviter's language. */
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  /** Default: club. An admin always has club scope. */
  @IsOptional()
  @IsEnum(ScopeType)
  scope?: ScopeType;

  @IsOptional()
  @IsUUID()
  activityId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  /** Staff and player: existing record to link the account to. Alternatively `name`. */
  @IsOptional()
  @IsUUID()
  personId?: string;

  /**
   * Staff and player: creates a record with only name and email. The rest is entered by the person
   * on acceptance. Alternatively `personId`.
   */
  @IsOptional()
  @Transform(trim)
  @Length(1, 100)
  name?: string;
}

export class AcceptInvitationDto {
  @IsString()
  @MaxLength(200)
  token!: string;
}

export class PreviewInvitationDto {
  @IsString()
  @MaxLength(4000)
  token!: string;
}
