import { Migration } from '@mikro-orm/migrations';

export class Migration20261114091911 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "sport_profiles" add column "unit_term" varchar(10) not null default 'team';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "sport_profiles" drop column "unit_term";`);
  }

}
