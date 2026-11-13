import { Migration } from '@mikro-orm/migrations';

export class Migration20261113210640 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "people" drop constraint people_check;`);

    this.addSql(`alter table "people" add column "anonymized_at" timestamptz null;`);
    this.addSql(`alter table "people" add constraint people_contact check((email is not null or phone is not null or anonymized_at is not null));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "people" drop constraint people_contact;`);
    this.addSql(`alter table "people" drop column "anonymized_at";`);

    this.addSql(`alter table "people" add constraint people_check check((email is not null or phone is not null));`);
  }

}
