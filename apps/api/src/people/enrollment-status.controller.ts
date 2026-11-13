import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { EnrollmentStatusDto } from './dto-admin';
import { RosterService } from './roster.service';

/** Injured state of a player (#27). Not admin only: the policy `people.manage` of the enrollment's team decides. */
@Controller()
export class EnrollmentStatusController {
  constructor(private readonly roster: RosterService) {}

  /** Roster of the team for staff, managers in scope and the admin (#29). */
  @Get('seasons/:id/team-roster')
  teamRoster(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.roster.teamRoster(a, id);
  }

  @Put('enrollments/:id/status')
  set(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollmentStatusDto) {
    return this.roster.setStatus(a, id, dto);
  }
}
