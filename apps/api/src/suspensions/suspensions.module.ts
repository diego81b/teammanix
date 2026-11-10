import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { SuspensionsController } from './suspensions.controller';
import { SuspensionsService } from './suspensions.service';

@Module({
  imports: [PermissionsModule],
  controllers: [SuspensionsController],
  providers: [SuspensionsService],
})
export class SuspensionsModule {}
