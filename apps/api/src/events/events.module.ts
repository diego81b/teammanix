import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CatalogService } from './catalog.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { SeriesService } from './series.service';

@Module({
  imports: [PermissionsModule],
  controllers: [EventsController, CalendarController],
  providers: [EventsService, SeriesService, CatalogService, CalendarService],
})
export class EventsModule {}
