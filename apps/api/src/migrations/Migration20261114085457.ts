import { Migration } from '@mikro-orm/migrations';

export class Migration20261114085457 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "teams" drop constraint "teams_activity_id_foreign";`);

    this.addSql(`alter table "invitations" drop constraint "invitations_activity_id_foreign";`);

    this.addSql(`alter table "access_roles" drop constraint "access_roles_activity_id_foreign";`);

    this.addSql(`create table "sections" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "name" varchar(100) not null, constraint "sections_pkey" primary key ("id"));`);
    this.addSql(`create index "sections_club_id_index" on "sections" ("club_id");`);
    this.addSql(`alter table "sections" add constraint "sections_club_id_name_unique" unique ("club_id", "name");`);

    this.addSql(`alter table "sections" add constraint "sections_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);

    this.addSql(`drop table if exists "activities" cascade;`);

    this.addSql(`alter table "invitations" drop constraint if exists "invitations_scope_check";`);

    this.addSql(`alter table "access_roles" drop constraint if exists "access_roles_scope_check";`);

    this.addSql(`drop index "teams_activity_id_index";`);
    this.addSql(`alter table "teams" drop constraint "teams_activity_id_name_unique";`);
    this.addSql(`alter table "teams" drop column "activity_id";`);

    this.addSql(`alter table "teams" add column "section_id" uuid null;`);
    this.addSql(`alter table "teams" add constraint "teams_section_id_foreign" foreign key ("section_id") references "sections" ("id") on update cascade on delete set null;`);
    this.addSql(`create index "teams_section_id_index" on "teams" ("section_id");`);
    this.addSql(`create unique index "teams_club_section_name_uq" on "teams" ("club_id", "section_id", "name") nulls not distinct;`);

    this.addSql(`alter table "invitations" drop constraint invitations_scope_consistent;`);

    this.addSql(`alter table "invitations" add constraint "invitations_scope_check" check("scope" in ('club', 'section', 'team'));`);
    this.addSql(`alter table "invitations" rename column "activity_id" to "section_id";`);
    this.addSql(`alter table "invitations" add constraint "invitations_section_id_foreign" foreign key ("section_id") references "sections" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "invitations" add constraint invitations_scope_consistent check(((scope = 'club' and section_id is null and team_id is null) or (scope = 'section' and section_id is not null and team_id is null) or (scope = 'team' and team_id is not null)));`);

    this.addSql(`alter table "access_roles" drop constraint access_scope_consistent_roles;`);

    this.addSql(`alter table "access_roles" add constraint "access_roles_scope_check" check("scope" in ('club', 'section', 'team'));`);
    this.addSql(`alter table "access_roles" rename column "activity_id" to "section_id";`);
    this.addSql(`alter table "access_roles" add constraint "access_roles_section_id_foreign" foreign key ("section_id") references "sections" ("id") on update cascade on delete no action;`);
    this.addSql(`alter table "access_roles" add constraint access_scope_consistent_roles check(((scope = 'club' and section_id is null and team_id is null) or (scope = 'section' and section_id is not null and team_id is null) or (scope = 'team' and team_id is not null)));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "teams" drop constraint "teams_section_id_foreign";`);

    this.addSql(`alter table "invitations" drop constraint "invitations_section_id_foreign";`);

    this.addSql(`alter table "access_roles" drop constraint "access_roles_section_id_foreign";`);

    this.addSql(`create table "activities" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "name" varchar(100) not null, constraint "activities_pkey" primary key ("id"));`);
    this.addSql(`create index "activities_club_id_index" on "activities" ("club_id");`);
    this.addSql(`alter table "activities" add constraint "activities_club_id_name_unique" unique ("club_id", "name");`);

    this.addSql(`alter table "activities" add constraint "activities_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);

    this.addSql(`drop table if exists "sections" cascade;`);

    this.addSql(`alter table "invitations" drop constraint if exists "invitations_scope_check";`);

    this.addSql(`alter table "access_roles" drop constraint if exists "access_roles_scope_check";`);

    this.addSql(`drop index "teams_section_id_index";`);
    this.addSql(`drop index "teams_club_section_name_uq";`);
    this.addSql(`alter table "teams" drop column "section_id";`);

    this.addSql(`alter table "teams" add column "activity_id" uuid not null;`);
    this.addSql(`alter table "teams" add constraint "teams_activity_id_foreign" foreign key ("activity_id") references "activities" ("id") on update cascade on delete cascade;`);
    this.addSql(`create index "teams_activity_id_index" on "teams" ("activity_id");`);
    this.addSql(`alter table "teams" add constraint "teams_activity_id_name_unique" unique ("activity_id", "name");`);

    this.addSql(`alter table "invitations" drop constraint invitations_scope_consistent;`);

    this.addSql(`alter table "invitations" add constraint "invitations_scope_check" check("scope" in ('club', 'activity', 'team'));`);
    this.addSql(`alter table "invitations" rename column "section_id" to "activity_id";`);
    this.addSql(`alter table "invitations" add constraint "invitations_activity_id_foreign" foreign key ("activity_id") references "activities" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "invitations" add constraint invitations_scope_consistent check(((scope = 'club' and activity_id is null and team_id is null) or (scope = 'activity' and activity_id is not null and team_id is null) or (scope = 'team' and team_id is not null)));`);

    this.addSql(`alter table "access_roles" drop constraint access_scope_consistent_roles;`);

    this.addSql(`alter table "access_roles" add constraint "access_roles_scope_check" check("scope" in ('club', 'activity', 'team'));`);
    this.addSql(`alter table "access_roles" rename column "section_id" to "activity_id";`);
    this.addSql(`alter table "access_roles" add constraint "access_roles_activity_id_foreign" foreign key ("activity_id") references "activities" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "access_roles" add constraint access_scope_consistent_roles check(((scope = 'club' and activity_id is null and team_id is null) or (scope = 'activity' and activity_id is not null and team_id is null) or (scope = 'team' and team_id is not null)));`);
  }

}
