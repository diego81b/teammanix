import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth, AuthLimit, WithoutClub } from '../common/decorators';
import { CreateClubDto } from './dto';
import { ClubService } from './club.service';

@Controller('club')
export class ClubController {
  constructor(private readonly club: ClubService) {}

  @WithoutClub()
  @AuthLimit()
  @Post()
  create(@CurrentAuth() a: AuthContext, @Body() dto: CreateClubDto) {
    return this.club.create(a.userId, dto);
  }

  /** Leaves the active club. Valid only with a token bound to that club. */
  @Post('current/detachment')
  @HttpCode(200)
  detach(@CurrentAuth() a: AuthContext) {
    return this.club.detach(a.userId, a.clubId as string);
  }
}
