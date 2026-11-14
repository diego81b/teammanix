import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, Length } from 'class-validator';
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
