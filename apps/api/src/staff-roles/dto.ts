import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, Length, MaxLength, ValidateNested } from 'class-validator';
import { StaffPolicyModel } from '../entities/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateStaffRoleDto {
  @Transform(trim)
  @Length(1, 60)
  name!: string;

  @IsEnum(StaffPolicyModel)
  policyModel!: StaffPolicyModel;

  /** Default false. */
  @IsOptional()
  @IsBoolean()
  mustBeAvailable?: boolean;
}

export class SuggestedStaffRoleDto {
  /** Code of a role the sport profile suggests: the model and the flag come from the profile. */
  @IsString()
  @MaxLength(40)
  code!: string;

  /** The name in the language of the admin, translated by the frontend. */
  @Transform(trim)
  @Length(1, 60)
  name!: string;
}

export class AddSuggestedStaffRolesDto {
  @IsString()
  @MaxLength(40)
  sportProfile!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SuggestedStaffRoleDto)
  roles!: SuggestedStaffRoleDto[];
}

export class EditStaffRoleDto {
  @IsOptional()
  @Transform(trim)
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsEnum(StaffPolicyModel)
  policyModel?: StaffPolicyModel;

  @IsOptional()
  @IsBoolean()
  mustBeAvailable?: boolean;

  /** true archives the role, false restores it. */
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
