import { Controller, Get } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { CalendarService } from './calendar.service';

/** Read only views. Writes to events stay in `EventsController`, under the `events.manage` policy. */
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  /** Personal calendar: the person's events across all their enrollments. */
  @Get('me')
  mine(@CurrentAuth() a: AuthContext) {
    return this.calendar.mine(a);
  }

  /** Seasons whose team calendar the person can open. */
  @Get('teams')
  seasons(@CurrentAuth() a: AuthContext) {
    return this.calendar.seasons(a);
  }

  /** Next event for the home, or null. */
  @Get('next')
  next(@CurrentAuth() a: AuthContext) {
    return this.calendar.next(a);
  }
}
