import { IsBoolean, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { CallupResponse, Placement, ReasonDecline } from '../entities/enums';

export class CallUpDto {
  @IsUUID()
  enrollmentId!: string;

  /** The coach confirms a call-up that asks for it (declared absence). It never overrides a hard block. */
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

/** `null` clears the mark. A missing key is invalid: the service answers `INVALID_DATA`. */
export class PlacementDto {
  @IsOptional()
  @IsEnum(Placement)
  placement?: Placement | null;
}

/** The answer of the person to an event. `pending` is not an answer: it is the lack of one. */
export class AnswerDto {
  @IsIn([CallupResponse.CONFIRMED, CallupResponse.DECLINED])
  response!: CallupResponse;

  /** Closed list, only for a player who declines. Whether it is required is decided by `checkAnswer`. */
  @IsOptional()
  @IsEnum(ReasonDecline)
  reason?: ReasonDecline | null;
}
