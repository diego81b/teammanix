import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { AttendanceService } from './attendance.service';
import { AttendanceDto } from './dto';

/** Writes need the `attendances.record` policy in the scope of the team (rule 14); reads follow ANALISI section 6. */
@Controller('events/:id/attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  view(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.view(a, id);
  }

  @Put(':enrollmentId')
  record(
    @CurrentAuth() a: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: AttendanceDto,
  ) {
    return this.attendance.record(a, id, enrollmentId, dto);
  }

  @Delete(':enrollmentId')
  @HttpCode(204)
  clear(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string) {
    return this.attendance.clear(a, id, enrollmentId);
  }
}
