import { Body, Controller, Get, HttpCode, Patch } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { CompleteRecordDto } from './dto';
import { PeopleService } from './people.service';

@Controller('people')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get('me')
  my(@CurrentAuth() a: AuthContext) {
    return this.people.my(a);
  }

  @Patch('me')
  @HttpCode(200)
  complete(@CurrentAuth() a: AuthContext, @Body() dto: CompleteRecordDto) {
    return this.people.completeMy(a, dto);
  }
}
