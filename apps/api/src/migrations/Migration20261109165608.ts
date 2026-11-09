import { Migration } from '@mikro-orm/migrations';

export class Migration20261109165608 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "clubs" add column "coach_roles" jsonb not null default '["coach"]';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "clubs" drop column "coach_roles";`);
  }

}
