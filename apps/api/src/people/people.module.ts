import { Module } from '@nestjs/common';
import { CertificatesModule } from '../certificates/certificates.module';
import { RegistryController } from './registry.controller';
import { RegistryService } from './registry.service';
import { CloningService } from './cloning.service';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { RosterService } from './roster.service';

@Module({
  imports: [CertificatesModule],
  controllers: [PeopleController, RegistryController],
  providers: [PeopleService, RegistryService, RosterService, CloningService],
})
export class PeopleModule {}
