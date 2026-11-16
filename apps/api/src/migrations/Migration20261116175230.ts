import { Migration } from '@mikro-orm/migrations';

export class Migration20261116175230 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "invitations" drop constraint "invitations_invited_by_id_foreign";`);

    this.addSql(`alter table "audit_log" drop constraint if exists "audit_log_action_check";`);

    this.addSql(`alter table "invitations" alter column "invited_by_id" drop default;`);
    this.addSql(`alter table "invitations" alter column "invited_by_id" type uuid using ("invited_by_id"::text::uuid);`);
    this.addSql(`alter table "invitations" alter column "invited_by_id" drop not null;`);
    this.addSql(`alter table "invitations" add constraint "invitations_invited_by_id_foreign" foreign key ("invited_by_id") references "users" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "audit_log" add constraint "audit_log_action_check" check("action" in ('registration', 'login_ok', 'login_ko', 'club_created', 'invitation_created', 'invitation_accepted', 'invitation_revoked', 'invitation_resent', 'policy_modified', 'role_assigned', 'role_removed', 'club_detachment', 'certificate_read', 'file_certificate_read', 'certificate_modified', 'enrollment_status_modified', 'person_disabled', 'person_reenabled', 'closed_enrollment', 'closed_season', 'person_exported', 'person_deleted', 'account_deleted', 'terms_accepted', 'absence_created', 'absence_modified', 'absence_cancelled', 'suspension_created', 'suspension_modified', 'suspension_cancelled', 'attendance_recorded', 'attendance_modified', 'attendance_cleared', 'statistics_read', 'expected_injury_created', 'expected_injury_modified', 'expected_injury_ended', 'expected_injury_read'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "invitations" drop constraint "invitations_invited_by_id_foreign";`);

    this.addSql(`alter table "audit_log" drop constraint if exists "audit_log_action_check";`);

    this.addSql(`alter table "invitations" alter column "invited_by_id" drop default;`);
    this.addSql(`alter table "invitations" alter column "invited_by_id" type uuid using ("invited_by_id"::text::uuid);`);
    this.addSql(`alter table "invitations" alter column "invited_by_id" set not null;`);
    this.addSql(`alter table "invitations" add constraint "invitations_invited_by_id_foreign" foreign key ("invited_by_id") references "users" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "audit_log" add constraint "audit_log_action_check" check("action" in ('registration', 'login_ok', 'login_ko', 'club_created', 'invitation_created', 'invitation_accepted', 'invitation_revoked', 'invitation_resent', 'policy_modified', 'role_assigned', 'role_removed', 'club_detachment', 'certificate_read', 'file_certificate_read', 'certificate_modified', 'enrollment_status_modified', 'person_disabled', 'person_reenabled', 'closed_enrollment', 'closed_season', 'person_exported', 'person_deleted', 'terms_accepted', 'absence_created', 'absence_modified', 'absence_cancelled', 'suspension_created', 'suspension_modified', 'suspension_cancelled', 'attendance_recorded', 'attendance_modified', 'attendance_cleared', 'statistics_read', 'expected_injury_created', 'expected_injury_modified', 'expected_injury_ended', 'expected_injury_read'));`);
  }

}
