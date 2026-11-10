import { Migration } from '@mikro-orm/migrations';

export class Migration20261109172414 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "absences" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "enrollment_id" uuid not null, "start_date" date not null, "end_date" date null, constraint "absences_pkey" primary key ("id"), constraint absences_check check ((end_date is null or end_date >= start_date)));`);
    this.addSql(`create index "absences_club_id_index" on "absences" ("club_id");`);
    this.addSql(`create index "absences_enrollment_id_index" on "absences" ("enrollment_id");`);

    this.addSql(`alter table "absences" add constraint "absences_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "absences" add constraint "absences_enrollment_id_foreign" foreign key ("enrollment_id") references "enrollments" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "notifications" drop constraint if exists "notifications_type_check";`);

    this.addSql(`alter table "audit_log" drop constraint if exists "audit_log_action_check";`);

    this.addSql(`alter table "notifications" add constraint "notifications_type_check" check("type" in ('callup', 'event_modified', 'event_cancelled', 'certificate_expiring', 'certificate_expired', 'absence_declared'));`);

    this.addSql(`alter table "audit_log" add constraint "audit_log_action_check" check("action" in ('registration', 'login_ok', 'login_ko', 'club_created', 'invitation_created', 'invitation_accepted', 'invitation_revoked', 'invitation_resent', 'policy_modified', 'role_assigned', 'role_removed', 'club_detachment', 'certificate_read', 'file_certificate_read', 'certificate_modified', 'enrollment_status_modified', 'person_disabled', 'person_reenabled', 'closed_enrollment', 'closed_season', 'person_exported', 'person_deleted', 'terms_accepted', 'absence_created', 'absence_modified', 'absence_cancelled'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "absences" cascade;`);

    this.addSql(`alter table "notifications" drop constraint if exists "notifications_type_check";`);

    this.addSql(`alter table "audit_log" drop constraint if exists "audit_log_action_check";`);

    this.addSql(`alter table "notifications" add constraint "notifications_type_check" check("type" in ('callup', 'event_modified', 'event_cancelled', 'certificate_expiring', 'certificate_expired'));`);

    this.addSql(`alter table "audit_log" add constraint "audit_log_action_check" check("action" in ('registration', 'login_ok', 'login_ko', 'club_created', 'invitation_created', 'invitation_accepted', 'invitation_revoked', 'invitation_resent', 'policy_modified', 'role_assigned', 'role_removed', 'club_detachment', 'certificate_read', 'file_certificate_read', 'certificate_modified', 'enrollment_status_modified', 'person_disabled', 'person_reenabled', 'closed_enrollment', 'closed_season', 'person_exported', 'person_deleted', 'terms_accepted'));`);
  }

}
