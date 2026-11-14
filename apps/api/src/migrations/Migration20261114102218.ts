import { Migration } from '@mikro-orm/migrations';

export class Migration20261114102218 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "staff_roles" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "name" varchar(60) not null, "name_key" varchar(60) not null, "policy_model" text check ("policy_model" in ('coach', 'assistant_coach', 'trainer', 'none')) not null, "must_be_available" boolean not null default false, "archived_at" timestamptz null, constraint "staff_roles_pkey" primary key ("id"));`);
    this.addSql(`create index "staff_roles_club_id_index" on "staff_roles" ("club_id");`);
    this.addSql(`alter table "staff_roles" add constraint "staff_roles_club_id_name_key_unique" unique ("club_id", "name_key");`);

    this.addSql(`alter table "staff_roles" add constraint "staff_roles_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "clubs" drop column "coach_roles";`);

    this.addSql(`alter table "enrollments" drop constraint enrollments_check;`);
    this.addSql(`alter table "enrollments" drop column "staff_role";`);

    this.addSql(`alter table "enrollments" add column "staff_role_id" uuid null;`);
    this.addSql(`alter table "enrollments" add constraint "enrollments_staff_role_id_foreign" foreign key ("staff_role_id") references "staff_roles" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "enrollments" add constraint enrollments_check check((type = 'staff' or staff_role_id is null));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "enrollments" drop constraint "enrollments_staff_role_id_foreign";`);

    this.addSql(`drop table if exists "staff_roles" cascade;`);

    this.addSql(`alter table "clubs" add column "coach_roles" jsonb not null default '["coach"]';`);

    this.addSql(`alter table "enrollments" drop constraint enrollments_check;`);
    this.addSql(`alter table "enrollments" drop column "staff_role_id";`);

    this.addSql(`alter table "enrollments" add column "staff_role" text check ("staff_role" in ('coach', 'assistant_coach', 'trainer', 'escort', 'other')) null;`);
    this.addSql(`alter table "enrollments" add constraint enrollments_check check((type = 'staff' or staff_role is null));`);
  }

}
