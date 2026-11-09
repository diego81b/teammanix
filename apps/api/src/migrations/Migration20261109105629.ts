import { Migration } from '@mikro-orm/migrations';

export class Migration20261109105629 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "events" add column "occurrence_date" date null;`);
    this.addSql(`create unique index "events_series_occurrence_uq" on "events" ("series_id", "occurrence_date") where "series_id" is not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "events_series_occurrence_uq";`);
    this.addSql(`alter table "events" drop column "occurrence_date";`);
  }

}
