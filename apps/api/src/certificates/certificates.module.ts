import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { StorageModule } from '../storage/storage.module';
import { CertificatesController } from './certificates.controller';
import { CertificatesDueController } from './certificates-due.controller';
import { CertificatesDueService } from './certificates-due.service';
import { CertificateAlertsService } from './certificate-alerts.service';
import { CertificatesService } from './certificates.service';

@Module({
  imports: [StorageModule, PermissionsModule],
  controllers: [CertificatesController, CertificatesDueController],
  providers: [CertificatesService, CertificatesDueService, CertificateAlertsService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
