import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { ClubController } from './club.controller';
import { ClubService } from './club.service';

@Module({ imports: [AuthModule], controllers: [ClubController, SettingsController], providers: [ClubService, SettingsService] })
export class ClubModule {}
