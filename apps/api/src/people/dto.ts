import { Transform } from 'class-transformer';
import { IsOptional, Length, Matches } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CompleteRecordDto {
  @Transform(trim)
  @Length(1, 100)
  surname!: string;

  /** YYYY-MM-DD. The check that it is a real, non-future date is in the service. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birthDate must be in YYYY-MM-DD format' })
  birthDate!: string;

  @IsOptional()
  @Transform(trim)
  @Length(5, 30)
  phone?: string;
}
