import { Body, Controller, DefaultValuePipe, Delete, Get, Headers, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { CenterService, DEFAULT_LIMIT } from './center.service';
import { EndpointDto, PreferenceDto, SubscriptionDto } from './dto';
import { PreferencesService } from './preferences.service';
import { PushService } from './push.service';

/** Any member reads and marks their own notifications: no permission applies, the account is the scope. */
@Controller('notifications')
export class CenterController {
  constructor(
    private readonly center: CenterService,
    private readonly preferences: PreferencesService,
    private readonly push: PushService,
  ) {}

  @Get()
  list(@CurrentAuth() a: AuthContext, @Query('limit', new DefaultValuePipe(DEFAULT_LIMIT), ParseIntPipe) limit: number) {
    return this.center.list(a, limit);
  }

  /** The account's choice for every club it belongs to. Declared before the `:id` routes. */
  @Get('preferences')
  preferencesList(@CurrentAuth() a: AuthContext) {
    return this.preferences.list(a);
  }

  @Put('preferences/:clubId')
  preferencesSave(@CurrentAuth() a: AuthContext, @Param('clubId', ParseUUIDPipe) clubId: string, @Body() dto: PreferenceDto) {
    return this.preferences.save(a, clubId, dto);
  }

  @Get('push/key')
  pushKey() {
    return this.push.publicKey();
  }

  @Put('push/subscription')
  @HttpCode(204)
  pushSubscribe(@CurrentAuth() a: AuthContext, @Body() dto: SubscriptionDto, @Headers('user-agent') userAgent?: string) {
    return this.push.subscribe(a, dto, userAgent?.slice(0, 300) ?? null);
  }

  @Delete('push/subscription')
  @HttpCode(204)
  pushUnsubscribe(@CurrentAuth() a: AuthContext, @Body() dto: EndpointDto) {
    return this.push.unsubscribe(a, dto.endpoint);
  }

  /** Declared before `:id/read` so that `read-all` is not taken for an id. */
  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentAuth() a: AuthContext) {
    return this.center.markAllRead(a);
  }

  @Post(':id/read')
  @HttpCode(204)
  read(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.center.markRead(a, id);
  }
}
