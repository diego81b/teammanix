import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth, AdminOnly } from '../common/decorators';
import { RolesService } from './roles.service';

@AdminOnly()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list() {
    return this.roles.list();
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.roles.remove(a, id);
  }
}
