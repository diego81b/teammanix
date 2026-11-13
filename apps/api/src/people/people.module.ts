import { Module } from '@nestjs/common';
import { CertificatesModule } from '../certificates/certificates.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RegistryController } from './registry.controller';
import { RegistryService } from './registry.service';
import { CloningService } from './cloning.service';
import { EnrollmentStatusController } from './enrollment-status.controller';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { RosterService } from './roster.service';
import { ExpectedInjuryService } from './expected-injury.service';

@Module({
  imports: [CertificatesModule, PermissionsModule],
  controllers: [PeopleController, RegistryController, EnrollmentStatusController],
  providers: [PeopleService, RegistryService, RosterService, CloningService, ExpectedInjuryService],
})
export class PeopleModule {}
