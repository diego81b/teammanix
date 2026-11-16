import { Migration } from '@mikro-orm/migrations';

export class Migration20261116181019 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "terms_acceptances" drop constraint "terms_acceptances_user_id_foreign";`);

    // Existing rows take the signer from the account they point to, then the columns become mandatory.
    this.addSql(`alter table "terms_acceptances" add column "signer_name" varchar(210) null, add column "signer_email" varchar(320) null;`);
    this.addSql(`update "terms_acceptances" t set "signer_name" = trim(u."name" || ' ' || u."surname"), "signer_email" = u."email" from "users" u where u."id" = t."user_id";`);
    this.addSql(`alter table "terms_acceptances" alter column "signer_name" set not null, alter column "signer_email" set not null;`);
    this.addSql(`alter table "terms_acceptances" alter column "user_id" drop default;`);
    this.addSql(`alter table "terms_acceptances" alter column "user_id" type uuid using ("user_id"::text::uuid);`);
    this.addSql(`alter table "terms_acceptances" alter column "user_id" drop not null;`);
    this.addSql(`alter table "terms_acceptances" add constraint "terms_acceptances_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "terms_acceptances" drop constraint "terms_acceptances_user_id_foreign";`);

    // Irreversible for the proofs whose account is gone: without the signer columns they identify nobody.
    this.addSql(`delete from "terms_acceptances" where "user_id" is null;`);
    this.addSql(`alter table "terms_acceptances" drop column "signer_name", drop column "signer_email";`);

    this.addSql(`alter table "terms_acceptances" alter column "user_id" drop default;`);
    this.addSql(`alter table "terms_acceptances" alter column "user_id" type uuid using ("user_id"::text::uuid);`);
    this.addSql(`alter table "terms_acceptances" alter column "user_id" set not null;`);
    this.addSql(`alter table "terms_acceptances" add constraint "terms_acceptances_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);
  }

}
