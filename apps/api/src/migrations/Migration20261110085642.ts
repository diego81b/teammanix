import { Migration } from '@mikro-orm/migrations';

export class Migration20261110085642 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "suspensions" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "enrollment_id" uuid not null, "form" text check ("form" in ('period', 'matches')) not null, "start_date" date not null, "match_count" int null, "end_date" date null, "competitions" text[] not null default '{}', "origin_event_id" uuid null, constraint "suspensions_pkey" primary key ("id"), constraint suspensions_shape check (((form = 'matches' and match_count >= 1 and end_date is null) or (form = 'period' and match_count is null and end_date is not null and end_date >= start_date and cardinality(competitions) = 0))));`);
    this.addSql(`create index "suspensions_club_id_index" on "suspensions" ("club_id");`);
    this.addSql(`create index "suspensions_enrollment_id_index" on "suspensions" ("enrollment_id");`);

    this.addSql(`alter table "suspensions" add constraint "suspensions_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "suspensions" add constraint "suspensions_enrollment_id_foreign" foreign key ("enrollment_id") references "enrollments" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "suspensions" add constraint "suspensions_origin_event_id_foreign" foreign key ("origin_event_id") references "events" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "audit_log" drop constraint if exists "audit_log_action_check";`);

    this.addSql(`alter table "audit_log" add constraint "audit_log_action_check" check("action" in ('registration', 'login_ok', 'login_ko', 'club_created', 'invitation_created', 'invitation_accepted', 'invitation_revoked', 'invitation_resent', 'policy_modified', 'role_assigned', 'role_removed', 'club_detachment', 'certificate_read', 'file_certificate_read', 'certificate_modified', 'enrollment_status_modified', 'person_disabled', 'person_reenabled', 'closed_enrollment', 'closed_season', 'person_exported', 'person_deleted', 'terms_accepted', 'absence_created', 'absence_modified', 'absence_cancelled', 'suspension_created', 'suspension_modified', 'suspension_cancelled'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "suspensions" cascade;`);

    this.addSql(`alter table "audit_log" drop constraint if exists "audit_log_action_check";`);

    this.addSql(`alter table "audit_log" add constraint "audit_log_action_check" check("action" in ('registration', 'login_ok', 'login_ko', 'club_created', 'invitation_created', 'invitation_accepted', 'invitation_revoked', 'invitation_resent', 'policy_modified', 'role_assigned', 'role_removed', 'club_detachment', 'certificate_read', 'file_certificate_read', 'certificate_modified', 'enrollment_status_modified', 'person_disabled', 'person_reenabled', 'closed_enrollment', 'closed_season', 'person_exported', 'person_deleted', 'terms_accepted', 'absence_created', 'absence_modified', 'absence_cancelled'));`);
  }

}
