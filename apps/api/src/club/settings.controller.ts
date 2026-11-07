import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth, AdminOnly } from '../common/decorators';
import { EditSettingsDto } from './dto';
import { SettingsService } from './settings.service';

@AdminOnly()
@Controller('club/current/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  read(@CurrentAuth() a: AuthContext) {
    return this.settings.read(a);
  }

  @Patch()
  edit(@CurrentAuth() a: AuthContext, @Body() dto: EditSettingsDto) {
    return this.settings.edit(a, dto);
  }
}
