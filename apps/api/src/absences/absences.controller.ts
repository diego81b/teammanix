import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { AbsencesService } from './absences.service';
import { AbsenceDto, DeclineDto } from './dto';

/**
 * Declared absences (rule 10). Only the person concerned writes; staff of the season, managers in scope and the admin
 * read the dates of the roster, nobody else reads.
 */
@Controller()
export class AbsencesController {
  constructor(private readonly absences: AbsencesService) {}

  /** The logged in person's open enrollments, with their absences. */
  @Get('absences/me')
  mine(@CurrentAuth() a: AuthContext) {
    return this.absences.mine(a);
  }

  /** Who is away in the team: the staff of the season, managers in scope and the admin. */
  @Get('seasons/:id/absences')
  ofSeason(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.absences.ofSeason(a, id);
  }

  @Get('enrollments/:id/absences')
  list(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.absences.list(a, id);
  }

  @Post('enrollments/:id/absences')
  create(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AbsenceDto) {
    return this.absences.create(a, id, dto);
  }

  @Patch('absences/:id')
  update(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AbsenceDto) {
    return this.absences.update(a, id, dto);
  }

  @Delete('absences/:id')
  @HttpCode(204)
  cancel(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.absences.cancel(a, id);
  }

  /** Declines the listed events, which must fall in this absence. */
  @Post('absences/:id/decline')
  @HttpCode(200)
  decline(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeclineDto) {
    return this.absences.decline(a, id, dto);
  }
}
