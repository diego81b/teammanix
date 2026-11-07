import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { IsObject } from 'class-validator';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth, AdminOnly } from '../common/decorators';
import { PermissionsService } from './permissions.service';

export class SetPermissionsDto {
  /** Differences from the role model: policy key and true (grants) or false (revokes). The service validates the content. */
  @IsObject()
  diff!: Record<string, unknown>;
}

@AdminOnly()
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  list() {
    return this.permissions.list();
  }

  @Put(':userId')
  @HttpCode(200)
  set(@CurrentAuth() a: AuthContext, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: SetPermissionsDto) {
    return this.permissions.set(a, userId, dto.diff);
  }
}
