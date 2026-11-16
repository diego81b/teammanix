import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { appConfig } from '../config/app.config';
import { MembershipsService } from './memberships.service';
import { AccountDeletionService } from './account-deletion.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenService } from './token.service';

@Module({
  imports: [
    // Read when the module is created, not when the file is imported: tests set JWT_SECRET before creating the app.
    JwtModule.registerAsync({ useFactory: () => ({ secret: appConfig().jwtSecret }) }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccountDeletionService, TokenService, MembershipsService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [AuthService, MembershipsService],
})
export class AuthModule {}
