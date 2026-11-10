import { Migration } from '@mikro-orm/migrations';

export class Migration20261110134222 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "notifications" drop constraint if exists "notifications_type_check";`);

    this.addSql(`alter table "notifications" add column "in_app" boolean not null default true;`);
    this.addSql(`alter table "notifications" add constraint "notifications_type_check" check("type" in ('callup', 'event_modified', 'event_cancelled', 'certificate_expiring', 'certificate_expired', 'certificates_due', 'absence_declared'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "notifications" drop constraint if exists "notifications_type_check";`);

    this.addSql(`alter table "notifications" drop column "in_app";`);

    this.addSql(`alter table "notifications" add constraint "notifications_type_check" check("type" in ('callup', 'event_modified', 'event_cancelled', 'certificate_expiring', 'certificate_expired', 'absence_declared'));`);
  }

}
