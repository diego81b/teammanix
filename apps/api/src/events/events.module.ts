import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { CatalogService } from './catalog.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { SeriesService } from './series.service';

@Module({ imports: [PermissionsModule], controllers: [EventsController], providers: [EventsService, SeriesService, CatalogService] })
export class EventsModule {}
