import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { StatisticsService } from './statistics.service';

/** Season statistics. Reads follow ANALISI section 6 and rules 10 to 13: no policy, the service decides by role. */
@Controller()
export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}

  /** Staff and the admin: every player. Managers in scope: the totals. A player: their own row. */
  @Get('seasons/:id/statistics')
  ofSeason(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.statistics.ofSeason(a, id);
  }

  /** One player: the person themselves or the staff of the season. A teammate is refused. */
  @Get('enrollments/:id/statistics')
  ofEnrollment(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.statistics.ofEnrollment(a, id);
  }

  /** The player's own figures in each of their seasons. */
  @Get('statistics/me')
  mine(@CurrentAuth() a: AuthContext) {
    return this.statistics.mine(a);
  }
}
