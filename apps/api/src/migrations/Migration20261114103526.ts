import { Migration } from '@mikro-orm/migrations';

export class Migration20261114103526 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "sport_profiles" add column "suggested_staff_roles" jsonb not null default '[]';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "sport_profiles" drop column "suggested_staff_roles";`);
  }

}
