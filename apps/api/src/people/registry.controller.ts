import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth, AdminOnly } from '../common/decorators';
import { RegistryService } from './registry.service';
import { CloneSeasonDto, CreatePersonDto, EnrollmentDto, EditEnrollmentDto, PromoteEnrollmentDto, SearchPeopleDto, StaffEnrollmentsDto } from './dto-admin';
import { CloningService } from './cloning.service';
import { RosterService } from './roster.service';
import { ErasureService } from './erasure.service';
import { exportFileName } from './erasure.rules';

/**
 * Registry, roster and disabling: admin only for now. Extension to staff and managers goes through policies
 * (`people.manage`, `people.disable`) when the role screens make them assignable.
 */
@AdminOnly()
@Controller()
export class RegistryController {
  constructor(
    private readonly registry: RegistryService,
    private readonly roster: RosterService,
    private readonly cloning: CloningService,
    private readonly erasure: ErasureService,
  ) {}

  @Post('people')
  create(@CurrentAuth() a: AuthContext, @Body() dto: CreatePersonDto) {
    return this.registry.create(a, dto);
  }

  @Get('people')
  list(@Query() q: SearchPeopleDto) {
    return this.registry.list(q.q);
  }

  @Get('people/disabled')
  disabled() {
    return this.registry.disabled();
  }

  @Get('people/:id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.registry.detail(id);
  }

  @Post('people/:id/disable')
  @HttpCode(200)
  disable(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.registry.disable(a, id);
  }

  @Post('people/:id/reenable')
  @HttpCode(200)
  reenable(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.registry.reenable(a, id);
  }

  @Get('people/:id/export')
  async export(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: FastifyReply) {
    const data = await this.erasure.export(a, id);
    res.header('Content-Disposition', `attachment; filename="${exportFileName(id)}"`);
    res.header('Cache-Control', 'no-store');
    return data;
  }

  @Delete('people/:id')
  @HttpCode(204)
  remove(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.erasure.delete(a, id);
  }

  @Get('seasons/:id/roster')
  listRoster(@Param('id', ParseUUIDPipe) id: string) {
    return this.roster.roster(id);
  }

  @Post('seasons/:id/enrollments')
  enroll(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollmentDto) {
    return this.roster.enroll(a, id, dto);
  }

  @Post('people/:id/staff-enrollments')
  enrollStaff(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StaffEnrollmentsDto) {
    return this.roster.enrollStaff(a, id, dto);
  }

  @Post('seasons/:id/clone')
  clone(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CloneSeasonDto) {
    return this.cloning.clone(a, id, dto);
  }

  @Post('enrollments/:id/promote')
  promote(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PromoteEnrollmentDto) {
    return this.cloning.promote(a, id, dto);
  }

  @Patch('enrollments/:id')
  edit(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditEnrollmentDto) {
    return this.roster.edit(a, id, dto);
  }

  @Post('enrollments/:id/close')
  @HttpCode(200)
  close(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.roster.close(a, id);
  }
}
