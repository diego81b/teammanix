import { Migration } from '@mikro-orm/migrations';

export class Migration20261111150000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "notifications" drop constraint if exists "notifications_type_check";`);

    this.addSql(`alter table "notifications" add constraint "notifications_type_check" check("type" in ('callup', 'event_modified', 'event_cancelled', 'certificate_expiring', 'certificate_expired', 'certificates_due', 'absence_declared', 'absence_freed'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "notifications" drop constraint if exists "notifications_type_check";`);

    this.addSql(`alter table "notifications" add constraint "notifications_type_check" check("type" in ('callup', 'event_modified', 'event_cancelled', 'certificate_expiring', 'certificate_expired', 'certificates_due', 'absence_declared'));`);
  }

}
