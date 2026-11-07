import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth, AuthLimit, Public, WithoutClub, AdminOnly } from '../common/decorators';
import { AcceptInvitationDto, PreviewInvitationDto, CreateInvitationDto } from './dto';
import { InvitationsService } from './invitations.service';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @AdminOnly()
  @Post()
  create(@CurrentAuth() a: AuthContext, @Body() dto: CreateInvitationDto) {
    return this.invitations.create(a, dto);
  }

  @AdminOnly()
  @Get()
  list() {
    return this.invitations.list();
  }

  @AdminOnly()
  @Post(':id/resend')
  @HttpCode(200)
  resend(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.invitations.resend(a, id);
  }

  @AdminOnly()
  @Delete(':id')
  @HttpCode(204)
  revoke(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.invitations.revoke(a, id);
  }

  /**
   * What is behind the link, before signing in or registering. The token is a secret of whoever received the email:
   * whoever holds it sees club, role and destination, never the email or other data. Every invalid case gives the same 404.
   */
  @Public()
  @AuthLimit()
  @Get('preview')
  preview(@Query() q: PreviewInvitationDto) {
    return this.invitations.preview(q.token);
  }

  /** For authenticated users who do not yet have a club: the typical case. */
  @WithoutClub()
  @AuthLimit()
  @Post('accept')
  @HttpCode(200)
  accept(@CurrentAuth() a: AuthContext, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(a.userId, dto.token);
  }
}
