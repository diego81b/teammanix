import { Migration } from '@mikro-orm/migrations';

export class Migration20261110162631 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "attendances" drop constraint if exists "attendances_outcome_check";`);
    this.addSql(`alter table "audit_log" drop constraint if exists "audit_log_action_check";`);

    this.addSql(`alter table "attendances" add constraint "attendances_outcome_check" check("outcome" in ('present', 'absent_excused', 'absent', 'late', 'injured'));`);
    this.addSql(`alter table "audit_log" add constraint "audit_log_action_check" check("action" in ('registration', 'login_ok', 'login_ko', 'club_created', 'invitation_created', 'invitation_accepted', 'invitation_revoked', 'invitation_resent', 'policy_modified', 'role_assigned', 'role_removed', 'club_detachment', 'certificate_read', 'file_certificate_read', 'certificate_modified', 'enrollment_status_modified', 'person_disabled', 'person_reenabled', 'closed_enrollment', 'closed_season', 'person_exported', 'person_deleted', 'terms_accepted', 'absence_created', 'absence_modified', 'absence_cancelled', 'suspension_created', 'suspension_modified', 'suspension_cancelled', 'attendance_recorded', 'attendance_modified', 'attendance_cleared'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "attendances" drop constraint if exists "attendances_outcome_check";`);
    this.addSql(`alter table "audit_log" drop constraint if exists "audit_log_action_check";`);

    this.addSql(`alter table "attendances" add constraint "attendances_outcome_check" check("outcome" in ('present', 'absent_excused', 'absent', 'late'));`);
    this.addSql(`alter table "audit_log" add constraint "audit_log_action_check" check("action" in ('registration', 'login_ok', 'login_ko', 'club_created', 'invitation_created', 'invitation_accepted', 'invitation_revoked', 'invitation_resent', 'policy_modified', 'role_assigned', 'role_removed', 'club_detachment', 'certificate_read', 'file_certificate_read', 'certificate_modified', 'enrollment_status_modified', 'person_disabled', 'person_reenabled', 'closed_enrollment', 'closed_season', 'person_exported', 'person_deleted', 'terms_accepted', 'absence_created', 'absence_modified', 'absence_cancelled', 'suspension_created', 'suspension_modified', 'suspension_cancelled'));`);
  }

}
