import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { CreateSuspensionDto, SuspensionDto } from './dto';
import { SuspensionsService } from './suspensions.service';

/**
 * Suspensions (rule 13). Written by who has the `suspensions.manage` policy in the team, never by the person concerned.
 * Read by the person, the staff of the season, managers in scope and the admin: never by teammates.
 */
@Controller()
export class SuspensionsController {
  constructor(private readonly suspensions: SuspensionsService) {}

  /** The logged in person's own suspensions, by open enrollment. */
  @Get('suspensions/me')
  mine(@CurrentAuth() a: AuthContext) {
    return this.suspensions.mine(a);
  }

  /** The suspensions of the team's season, for the team page. */
  @Get('seasons/:id/suspensions')
  ofSeason(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.suspensions.ofSeason(a, id);
  }

  /** Season, people and permission the team page needs to write. */
  @Get('seasons/:id/suspensions-context')
  context(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.suspensions.context(a, id);
  }

  @Get('enrollments/:id/suspensions')
  list(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.suspensions.list(a, id);
  }

  @Post('enrollments/:id/suspensions')
  create(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateSuspensionDto) {
    return this.suspensions.create(a, id, dto);
  }

  @Patch('suspensions/:id')
  update(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SuspensionDto) {
    return this.suspensions.update(a, id, dto);
  }

  @Delete('suspensions/:id')
  @HttpCode(204)
  cancel(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.suspensions.cancel(a, id);
  }
}
