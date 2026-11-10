import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CertificatesController } from './certificates.controller';
import { CertificateAlertsService } from './certificate-alerts.service';
import { CertificatesService } from './certificates.service';

@Module({
  imports: [StorageModule],
  controllers: [CertificatesController],
  providers: [CertificatesService, CertificateAlertsService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
