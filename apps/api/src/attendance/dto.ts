import { IsEnum } from 'class-validator';
import { AttendanceOutcome } from '../entities/enums';

/** The outcome only, from a closed list: no free note, so health data cannot get in (ANALISI section 7). */
export class AttendanceDto {
  @IsEnum(AttendanceOutcome)
  outcome!: AttendanceOutcome;
}
