import { Migration } from '@mikro-orm/migrations';

export class Migration20261109163120 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "callup_response_changes" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "event_id" uuid not null, "enrollment_id" uuid not null, "from_response" text check ("from_response" in ('pending', 'confirmed', 'declined')) not null, "from_reason" text check ("from_reason" in ('commitment_personal', 'work', 'not_available')) null, "to_response" text check ("to_response" in ('pending', 'confirmed', 'declined')) not null, "to_reason" text check ("to_reason" in ('commitment_personal', 'work', 'not_available')) null, "changed_by_id" uuid null, "changed_at" timestamptz not null, constraint "callup_response_changes_pkey" primary key ("id"));`);
    this.addSql(`create index "callup_response_changes_club_id_index" on "callup_response_changes" ("club_id");`);
    this.addSql(`create index "callup_response_changes_event_id_enrollment_id_created_at_index" on "callup_response_changes" ("event_id", "enrollment_id", "created_at");`);

    this.addSql(`alter table "callup_response_changes" add constraint "callup_response_changes_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "callup_response_changes" add constraint "callup_response_changes_event_id_foreign" foreign key ("event_id") references "events" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "callup_response_changes" add constraint "callup_response_changes_enrollment_id_foreign" foreign key ("enrollment_id") references "enrollments" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "callup_response_changes" add constraint "callup_response_changes_changed_by_id_foreign" foreign key ("changed_by_id") references "users" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "clubs" add column "warn_no_coach_available" boolean not null default true;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "callup_response_changes" cascade;`);

    this.addSql(`alter table "clubs" drop column "warn_no_coach_available";`);
  }

}
