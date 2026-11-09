import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { AnswerDto } from './dto';
import { ResponsesService } from './responses.service';

/** Answers of the person who is logged in, and the trail of changes (staff, managers and admin only). */
@Controller('events/:id')
export class ResponsesController {
  constructor(private readonly responses: ResponsesService) {}

  @Put('callups/me')
  @HttpCode(200)
  answer(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnswerDto) {
    return this.responses.answerAsPlayer(a, id, dto);
  }

  @Put('availability/me')
  @HttpCode(200)
  availability(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnswerDto) {
    return this.responses.answerAsStaff(a, id, dto);
  }

  @Get('callups/:enrollmentId/history')
  history(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string) {
    return this.responses.history(a, id, enrollmentId);
  }
}
