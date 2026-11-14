import { Migration } from '@mikro-orm/migrations';

/** Schema only, no data mapping: run the dev data reset first (teams.sport_profile_id is NOT NULL, opponents change parent). */
export class Migration20261114083853 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "activities" drop constraint "activities_sport_profile_id_foreign";`);

    this.addSql(`alter table "opponents" drop constraint "opponents_activity_id_foreign";`);

    this.addSql(`alter table "activities" drop column "sport_profile_id", drop column "modules_active";`);

    this.addSql(`alter table "teams" add column "sport_profile_id" uuid not null, add column "modules_active" jsonb not null;`);
    this.addSql(`alter table "teams" add constraint "teams_sport_profile_id_foreign" foreign key ("sport_profile_id") references "sport_profiles" ("id") on update cascade;`);

    this.addSql(`alter table "opponents" drop constraint "opponents_activity_id_name_unique";`);

    this.addSql(`alter table "opponents" rename column "activity_id" to "team_id";`);
    this.addSql(`alter table "opponents" add constraint "opponents_team_id_foreign" foreign key ("team_id") references "teams" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "opponents" add constraint "opponents_team_id_name_unique" unique ("team_id", "name");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "opponents" drop constraint "opponents_team_id_foreign";`);

    this.addSql(`alter table "teams" drop constraint "teams_sport_profile_id_foreign";`);

    this.addSql(`alter table "activities" add column "sport_profile_id" uuid not null, add column "modules_active" jsonb not null;`);
    this.addSql(`alter table "activities" add constraint "activities_sport_profile_id_foreign" foreign key ("sport_profile_id") references "sport_profiles" ("id") on update cascade;`);

    this.addSql(`alter table "opponents" drop constraint "opponents_team_id_name_unique";`);

    this.addSql(`alter table "opponents" rename column "team_id" to "activity_id";`);
    this.addSql(`alter table "opponents" add constraint "opponents_activity_id_foreign" foreign key ("activity_id") references "activities" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "opponents" add constraint "opponents_activity_id_name_unique" unique ("activity_id", "name");`);

    this.addSql(`alter table "teams" drop column "sport_profile_id", drop column "modules_active";`);
  }

}
