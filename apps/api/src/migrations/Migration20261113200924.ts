import { Migration } from '@mikro-orm/migrations';

export class Migration20261113200924 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "expected_injuries" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "enrollment_id" uuid not null, "start_date" date not null, "return_date" date not null, constraint "expected_injuries_pkey" primary key ("id"), constraint expected_injuries_dates check (return_date > start_date));`);
    this.addSql(`create index "expected_injuries_club_id_index" on "expected_injuries" ("club_id");`);
    this.addSql(`alter table "expected_injuries" add constraint "expected_injuries_enrollment_id_unique" unique ("enrollment_id");`);

    this.addSql(`alter table "expected_injuries" add constraint "expected_injuries_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "expected_injuries" add constraint "expected_injuries_enrollment_id_foreign" foreign key ("enrollment_id") references "enrollments" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "audit_log" drop constraint if exists "audit_log_action_check";`);

    this.addSql(`alter table "audit_log" add constraint "audit_log_action_check" check("action" in ('registration', 'login_ok', 'login_ko', 'club_created', 'invitation_created', 'invitation_accepted', 'invitation_revoked', 'invitation_resent', 'policy_modified', 'role_assigned', 'role_removed', 'club_detachment', 'certificate_read', 'file_certificate_read', 'certificate_modified', 'enrollment_status_modified', 'person_disabled', 'person_reenabled', 'closed_enrollment', 'closed_season', 'person_exported', 'person_deleted', 'terms_accepted', 'absence_created', 'absence_modified', 'absence_cancelled', 'suspension_created', 'suspension_modified', 'suspension_cancelled', 'attendance_recorded', 'attendance_modified', 'attendance_cleared', 'statistics_read', 'expected_injury_created', 'expected_injury_modified', 'expected_injury_ended', 'expected_injury_read'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "expected_injuries" cascade;`);

    this.addSql(`alter table "audit_log" drop constraint if exists "audit_log_action_check";`);

    this.addSql(`alter table "audit_log" add constraint "audit_log_action_check" check("action" in ('registration', 'login_ok', 'login_ko', 'club_created', 'invitation_created', 'invitation_accepted', 'invitation_revoked', 'invitation_resent', 'policy_modified', 'role_assigned', 'role_removed', 'club_detachment', 'certificate_read', 'file_certificate_read', 'certificate_modified', 'enrollment_status_modified', 'person_disabled', 'person_reenabled', 'closed_enrollment', 'closed_season', 'person_exported', 'person_deleted', 'terms_accepted', 'absence_created', 'absence_modified', 'absence_cancelled', 'suspension_created', 'suspension_modified', 'suspension_cancelled', 'attendance_recorded', 'attendance_modified', 'attendance_cleared', 'statistics_read'));`);
  }

}
