import { Module } from '@nestjs/common';
import { CertificatesModule } from '../certificates/certificates.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { CallupsController } from './callups.controller';
import { CallupsService } from './callups.service';
import { ResponsesController } from './responses.controller';
import { ResponsesService } from './responses.service';

@Module({
  imports: [PermissionsModule, CertificatesModule],
  controllers: [CallupsController, ResponsesController],
  providers: [CallupsService, ResponsesService],
})
export class CallupsModule {}
