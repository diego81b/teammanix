import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { CallupsService } from './callups.service';
import { CallUpDto, PlacementDto } from './dto';

/** Writes need the `callups.manage` policy in the scope of the team (rule 14); reads follow ANALISI section 6. */
@Controller('events/:id/callups')
export class CallupsController {
  constructor(private readonly callups: CallupsService) {}

  @Get()
  lists(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.callups.lists(a, id);
  }

  @Post()
  add(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CallUpDto) {
    return this.callups.add(a, id, dto);
  }

  /** Marks as sent the call-ups not sent yet. Declared before the `:enrollmentId` routes. */
  @Post('send')
  @HttpCode(200)
  send(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.callups.send(a, id);
  }

  @Delete(':enrollmentId')
  @HttpCode(204)
  remove(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string) {
    return this.callups.remove(a, id, enrollmentId);
  }

  @Patch(':enrollmentId')
  placement(
    @CurrentAuth() a: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: PlacementDto,
  ) {
    return this.callups.placement(a, id, enrollmentId, dto);
  }
}
