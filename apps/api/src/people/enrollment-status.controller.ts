import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { EnrollmentStatusDto, ExpectedInjuryDto } from './dto-admin';
import { ExpectedInjuryService } from './expected-injury.service';
import { RosterService } from './roster.service';

/** Injured state of a player (#27). Not admin only: the policy `people.manage` of the enrollment's team decides. */
@Controller()
export class EnrollmentStatusController {
  constructor(
    private readonly roster: RosterService,
    private readonly expected: ExpectedInjuryService,
  ) {}

  /** Roster of the team for staff, managers in scope and the admin (#29). */
  @Get('seasons/:id/team-roster')
  teamRoster(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.roster.teamRoster(a, id);
  }

  @Put('enrollments/:id/status')
  set(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollmentStatusDto) {
    return this.roster.setStatus(a, id, dto);
  }

  /** Probably injured (#21): records or moves the expected period. Confirming goes through the status route. */
  @Put('enrollments/:id/expected-injury')
  setExpected(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExpectedInjuryDto) {
    return this.expected.set(a, id, dto);
  }

  @Delete('enrollments/:id/expected-injury')
  @HttpCode(204)
  async endExpected(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.expected.end(a, id);
  }
}
