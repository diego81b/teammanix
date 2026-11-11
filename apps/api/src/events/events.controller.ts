import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { EventStatus } from '../entities/enums';
import { CatalogService } from './catalog.service';
import { CreateEventDto, CreateSeriesDto, CreateVenueDto, EditEventDto, EditSeriesDto, EditVenueDto } from './dto';
import { EventsService } from './events.service';
import { SeriesService } from './series.service';

/** Writes need the `events.manage` policy in the scope of the team (rule 14); reads follow ANALISI section 6. */
@Controller()
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly catalog: CatalogService,
    private readonly series: SeriesService,
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

  @Post('teams/:id/series')
  createSeries(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateSeriesDto) {
    return this.series.create(a, id, dto);
  }

  @Get('series/:id')
  getSeries(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.series.get(a, id);
  }

  /** "All future ones". Editing "only this one" is `PATCH events/:id`. */
  @Patch('series/:id')
  editSeries(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditSeriesDto) {
    return this.series.edit(a, id, dto);
  }

  /** What "remove the future sessions" would do: the confirmation shows it before anything changes. */
  @Get('series/:id/future-sessions')
  futureSessions(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.series.removalPreview(a, id);
  }

  /** Removes the sessions of the series whose attendance check has not opened, and ends the series before them. */
  @Delete('series/:id/future-sessions')
  removeFutureSessions(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.series.removeFuture(a, id);
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
