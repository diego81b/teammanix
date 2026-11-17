import { Migration } from '@mikro-orm/migrations';

export class Migration20261117142742 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "invitations" add column "created_draft" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "invitations" drop column "created_draft";`);
  }

}
