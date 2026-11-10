import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CenterController } from './center.controller';
import { CenterService } from './center.service';
import { NotificationsService } from './notifications.service';
import { PreferencesService } from './preferences.service';
import { PushService } from './push.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [CenterController],
  providers: [NotificationsService, CenterService, PreferencesService, PushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
