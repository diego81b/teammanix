import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CertificateType } from '../entities/enums';

/** Only type, issue and expiry: no clinical data in any field. Date validation is in the service. */
export class CreateCertificateDto {
  @IsEnum(CertificateType)
  type!: CertificateType;

  @IsString()
  @MaxLength(10)
  issueDate!: string;

  @IsString()
  @MaxLength(10)
  expiryDate!: string;
}

export class EditCertificateDto {
  @IsOptional()
  @IsEnum(CertificateType)
  type?: CertificateType;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  issueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  expiryDate?: string;
}
