import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength, MinLength } from 'class-validator';
import { Language } from '../entities/enums';

const lowercase = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class EmailDto {
  @Transform(lowercase)
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class RegistrationDto extends EmailDto {
  @IsString()
  @MinLength(10, { message: 'The password must be at least 10 characters long' })
  @MaxLength(128)
  password!: string;

  @Transform(trim)
  @Length(1, 100)
  name!: string;

  @Transform(trim)
  @Length(1, 100)
  surname!: string;

  /** Acceptance of terms of service and privacy notice (click-wrap). */
  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms and privacy notice' })
  acceptTerms!: boolean;

  /** UI language at registration time: it is the language of the emails the user will receive. */
  @IsOptional()
  @IsEnum(Language)
  language?: Language;
}

export class ChangeLanguageDto {
  @IsEnum(Language)
  language!: Language;
}

export class LoginDto extends EmailDto {
  @IsString()
  @MaxLength(128)
  password!: string;
}

export class TokenDto {
  @IsString()
  @MaxLength(4000)
  token!: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @MinLength(10, { message: 'The password must be at least 10 characters long' })
  @MaxLength(128)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(10, { message: 'The password must be at least 10 characters long' })
  @MaxLength(128)
  newPassword!: string;
}

export class SelectClubDto {
  @IsUUID()
  clubId!: string;
}
