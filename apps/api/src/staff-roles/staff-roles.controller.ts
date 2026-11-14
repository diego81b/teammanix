import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { AdminOnly, CurrentAuth } from '../common/decorators';
import { CreateStaffRoleDto, EditStaffRoleDto } from './dto';
import { StaffRolesService } from './staff-roles.service';

@Controller('staff-roles')
export class StaffRolesController {
  constructor(private readonly roles: StaffRolesService) {}

  /** Any member of the club: forms and lists need the names. */
  @Get()
  list() {
    return this.roles.list();
  }

  @AdminOnly()
  @Post()
  create(@CurrentAuth() a: AuthContext, @Body() dto: CreateStaffRoleDto) {
    return this.roles.create(a, dto);
  }

  /** Name, permission model, flag, archive (`archived: true`) and restore (`archived: false`). */
  @AdminOnly()
  @Patch(':id')
  edit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditStaffRoleDto) {
    return this.roles.edit(id, dto);
  }

  /** Refused with STAFF_ROLE_IN_USE while an enrollment has the role. */
  @AdminOnly()
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.remove(id);
  }
}
