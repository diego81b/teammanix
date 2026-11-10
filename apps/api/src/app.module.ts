import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { AbsencesModule } from './absences/absences.module';
import { CallupsModule } from './callups/callups.module';
import { CertificatesModule } from './certificates/certificates.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health.controller';
import { InvitationsModule } from './invitations/invitations.module';
import { MailModule } from './mail/mail.module';
import config from './mikro-orm.config';
import { PeopleModule } from './people/people.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { ClubModule } from './club/club.module';
import { StructureModule } from './structure/structure.module';
import { SuspensionsModule } from './suspensions/suspensions.module';

@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      useFactory: () => ({
        ...config,
        clientUrl: process.env.DATABASE_URL ?? config.clientUrl,
        debug: false,
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: process.env.NODE_ENV === 'test' ? 100_000 : 300 }]),
    MailModule,
    AuditModule,
    AuthModule,
    ClubModule,
    InvitationsModule,
    PermissionsModule,
    PeopleModule,
    CertificatesModule,
    RolesModule,
    StructureModule,
    EventsModule,
    CallupsModule,
    AbsencesModule,
    SuspensionsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
