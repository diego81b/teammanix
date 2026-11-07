import { Module } from '@nestjs/common';
import { AuthorizationsService } from './authorizations.service';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

@Module({ controllers: [PermissionsController], providers: [PermissionsService, AuthorizationsService], exports: [AuthorizationsService] })
export class PermissionsModule {}
