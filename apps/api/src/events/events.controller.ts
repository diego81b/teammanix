import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { EventStatus } from '../entities/enums';
import { CatalogService } from './catalog.service';
import { CreateEventDto, CreateVenueDto, EditEventDto, EditVenueDto } from './dto';
import { EventsService } from './events.service';

/** Writes need the `events.manage` policy in the scope of the team (rule 14); reads follow ANALISI section 6. */
@Controller()
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly catalog: CatalogService,
  ) {}

  @Get('venues')
  venues() {
    return this.catalog.venues();
  }

  @Post('venues')
  createVenue(@CurrentAuth() a: AuthContext, @Body() dto: CreateVenueDto) {
    return this.catalog.createVenue(a, dto);
  }

  @Patch('venues/:id')
  editVenue(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditVenueDto) {
    return this.catalog.editVenue(a, id, dto);
  }

  @Get('teams/:id/opponents')
  opponents(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.opponents(a, id);
  }

  @Post('teams/:id/events')
  create(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateEventDto) {
    return this.events.create(a, id, dto);
  }

  @Get('seasons/:id/events')
  list(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.list(a, id);
  }

  @Get('seasons/:id/events-access')
  access(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.access(a, id);
  }

  @Get('seasons/:id/competitions')
  competitions(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.competitions(a, id);
  }

  @Patch('events/:id')
  edit(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditEventDto) {
    return this.events.edit(a, id, dto);
  }

  @Post('events/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.changeStatus(a, id, EventStatus.CANCELLED);
  }

  @Post('events/:id/postpone')
  @HttpCode(200)
  postpone(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.changeStatus(a, id, EventStatus.POSTPONED);
  }
}
