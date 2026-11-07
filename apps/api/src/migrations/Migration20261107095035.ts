import { Migration } from '@mikro-orm/migrations';

export class Migration20261107095035 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "clubs" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "name" varchar(200) not null, "logo_url" text null, "theme" jsonb null, "block_certificate_expired" boolean not null default true, "certificates_with_file" boolean not null default false, constraint "clubs_pkey" primary key ("id"));`);

    this.addSql(`create table "sport_profiles" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "code" varchar(40) not null, "positions" jsonb not null, "starter_bench" boolean not null default false, "max_starters" int null, "modules_available" jsonb not null, constraint "sport_profiles_pkey" primary key ("id"));`);
    this.addSql(`alter table "sport_profiles" add constraint "sport_profiles_code_unique" unique ("code");`);

    this.addSql(`create table "activities" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "name" varchar(100) not null, "sport_profile_id" uuid not null, "modules_active" jsonb not null, constraint "activities_pkey" primary key ("id"));`);
    this.addSql(`create index "activities_club_id_index" on "activities" ("club_id");`);
    this.addSql(`alter table "activities" add constraint "activities_club_id_name_unique" unique ("club_id", "name");`);

    this.addSql(`create table "opponents" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "activity_id" uuid not null, "name" varchar(150) not null, constraint "opponents_pkey" primary key ("id"));`);
    this.addSql(`create index "opponents_club_id_index" on "opponents" ("club_id");`);
    this.addSql(`alter table "opponents" add constraint "opponents_activity_id_name_unique" unique ("activity_id", "name");`);

    this.addSql(`create table "teams" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "activity_id" uuid not null, "name" varchar(100) not null, "category" varchar(60) null, "gender" text check ("gender" in ('male', 'female', 'mixed')) null, "logo_url" text null, constraint "teams_pkey" primary key ("id"));`);
    this.addSql(`create index "teams_club_id_index" on "teams" ("club_id");`);
    this.addSql(`create index "teams_activity_id_index" on "teams" ("activity_id");`);
    this.addSql(`alter table "teams" add constraint "teams_activity_id_name_unique" unique ("activity_id", "name");`);

    this.addSql(`create table "seasons" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "team_id" uuid not null, "name" varchar(60) not null, "start_date" date not null, "end_date" date not null, "status" text check ("status" in ('draft', 'active', 'closed')) not null default 'draft', "league" varchar(150) null, constraint "seasons_pkey" primary key ("id"), constraint seasons_check check (end_date >= start_date));`);
    this.addSql(`create index "seasons_club_id_index" on "seasons" ("club_id");`);
    this.addSql(`create unique index "seasons_one_draft_per_team_uq" on "seasons" ("team_id") where "status" = 'draft';`);
    this.addSql(`create unique index "seasons_one_active_per_team_uq" on "seasons" ("team_id") where "status" = 'active';`);
    this.addSql(`create index "seasons_team_id_start_date_index" on "seasons" ("team_id", "start_date");`);

    this.addSql(`create table "users" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "email" varchar(320) not null, "password_hash" varchar(255) not null, "name" varchar(100) not null, "surname" varchar(100) not null, "language" text check ("language" in ('it', 'en', 'fr')) not null default 'it', "email_verified_at" timestamptz null, "deactivated_at" timestamptz null, "token_valid_from" timestamptz null, "last_access_at" timestamptz null, constraint "users_pkey" primary key ("id"));`);
    this.addSql(`alter table "users" add constraint "users_email_unique" unique ("email");`);

    this.addSql(`create table "terms_acceptances" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "user_id" uuid not null, "club_id" uuid null, "type" text check ("type" in ('terms', 'privacy', 'dpa')) not null, "version" varchar(30) not null, "accepted_at" timestamptz not null, constraint "terms_acceptances_pkey" primary key ("id"));`);
    this.addSql(`create index "terms_acceptances_user_id_type_version_index" on "terms_acceptances" ("user_id", "type", "version");`);

    this.addSql(`create table "push_subscriptions" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "user_id" uuid not null, "endpoint" text not null, "p256dh" varchar(200) not null, "auth" varchar(100) not null, "user_agent" varchar(300) null, "last_error_at" timestamptz null, constraint "push_subscriptions_pkey" primary key ("id"));`);
    this.addSql(`create index "push_subscriptions_user_id_index" on "push_subscriptions" ("user_id");`);
    this.addSql(`alter table "push_subscriptions" add constraint "push_subscriptions_endpoint_unique" unique ("endpoint");`);

    this.addSql(`create table "people" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "name" varchar(100) not null, "surname" varchar(100) null, "birth_date" date null, "completed_at" timestamptz null, "email" varchar(320) null, "phone" varchar(30) null, "photo_url" text null, "disabled_at" timestamptz null, "user_id" uuid null, constraint "people_pkey" primary key ("id"), constraint people_complete_consistent check ((completed_at is null or (surname is not null and birth_date is not null))), constraint people_check check ((email is not null or phone is not null)));`);
    this.addSql(`create index "people_club_id_index" on "people" ("club_id");`);
    this.addSql(`create index "people_user_id_index" on "people" ("user_id");`);
    this.addSql(`create index "people_club_id_surname_name_index" on "people" ("club_id", "surname", "name");`);
    this.addSql(`alter table "people" add constraint "people_club_id_user_id_unique" unique ("club_id", "user_id");`);

    this.addSql(`create table "guardian_links" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "minor_id" uuid not null, "guardian_id" uuid not null, "relation" text check ("relation" in ('parent', 'legal_guardian', 'other')) not null, constraint "guardian_links_pkey" primary key ("id"), constraint guardian_links_check check (minor_id <> guardian_id));`);
    this.addSql(`create index "guardian_links_club_id_index" on "guardian_links" ("club_id");`);
    this.addSql(`create index "guardian_links_minor_id_index" on "guardian_links" ("minor_id");`);
    this.addSql(`create index "guardian_links_guardian_id_index" on "guardian_links" ("guardian_id");`);
    this.addSql(`alter table "guardian_links" add constraint "guardian_links_minor_id_guardian_id_unique" unique ("minor_id", "guardian_id");`);

    this.addSql(`create table "enrollments" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "season_id" uuid not null, "person_id" uuid not null, "type" text check ("type" in ('player', 'staff')) not null, "staff_role" text check ("staff_role" in ('coach', 'assistant_coach', 'trainer', 'escort', 'other')) null, "position" varchar(40) null, "jersey_number" int null, "status" text check ("status" in ('available', 'injured')) not null default 'available', "ended_at" date null, constraint "enrollments_pkey" primary key ("id"), constraint enrollments_check check ((type = 'staff' or staff_role is null)));`);
    this.addSql(`create index "enrollments_club_id_index" on "enrollments" ("club_id");`);
    this.addSql(`create index "enrollments_person_id_index" on "enrollments" ("person_id");`);
    this.addSql(`alter table "enrollments" add constraint "enrollments_season_id_person_id_type_unique" unique ("season_id", "person_id", "type");`);

    this.addSql(`create table "consents" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "person_id" uuid not null, "type" text check ("type" in ('guardian_of_minor', 'images')) not null, "status" text check ("status" in ('granted', 'revoked')) not null, "data" timestamptz not null, "granted_by_id" uuid null, constraint "consents_pkey" primary key ("id"));`);
    this.addSql(`create index "consents_club_id_index" on "consents" ("club_id");`);
    this.addSql(`alter table "consents" add constraint "consents_person_id_type_unique" unique ("person_id", "type");`);

    this.addSql(`create table "notification_preferences" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "user_id" uuid not null, "club_id" uuid not null, "in_app" boolean not null default true, "email" boolean not null default true, "push" boolean not null default true, constraint "notification_preferences_pkey" primary key ("id"));`);
    this.addSql(`create index "notification_preferences_club_id_index" on "notification_preferences" ("club_id");`);
    this.addSql(`alter table "notification_preferences" add constraint "notification_preferences_user_id_club_id_unique" unique ("user_id", "club_id");`);

    this.addSql(`create table "notifications" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "user_id" uuid not null, "type" text check ("type" in ('callup', 'event_modified', 'event_cancelled', 'certificate_expiring', 'certificate_expired')) not null, "params" jsonb not null, "link" varchar(300) null, "dedup_key" varchar(120) null, "read_at" timestamptz null, "email_sent_at" timestamptz null, "push_sent_at" timestamptz null, constraint "notifications_pkey" primary key ("id"));`);
    this.addSql(`create index "notifications_club_id_index" on "notifications" ("club_id");`);
    this.addSql(`create index "notifications_user_id_read_at_created_at_index" on "notifications" ("user_id", "read_at", "created_at");`);
    this.addSql(`alter table "notifications" add constraint "notifications_user_id_dedup_key_unique" unique ("user_id", "dedup_key");`);

    this.addSql(`create table "memberships" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "user_id" uuid not null, "diff" jsonb not null, constraint "memberships_pkey" primary key ("id"));`);
    this.addSql(`create index "memberships_club_id_index" on "memberships" ("club_id");`);
    this.addSql(`alter table "memberships" add constraint "memberships_club_id_user_id_unique" unique ("club_id", "user_id");`);

    this.addSql(`create table "invitations" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "email" varchar(320) not null, "role" text check ("role" in ('admin', 'manager', 'staff', 'player')) not null, "scope" text check ("scope" in ('club', 'activity', 'team')) not null, "activity_id" uuid null, "team_id" uuid null, "person_id" uuid null, "token_hash" varchar(64) not null, "language" text check ("language" in ('it', 'en', 'fr')) not null default 'it', "expires_at" timestamptz not null, "status" text check ("status" in ('sent', 'accepted', 'revoked', 'expired')) not null default 'sent', "invited_by_id" uuid not null, "accepted_by_id" uuid null, constraint "invitations_pkey" primary key ("id"), constraint invitations_admin_only_club check ((role <> 'admin' or scope = 'club')), constraint invitations_scope_consistent check (((scope = 'club' and activity_id is null and team_id is null) or (scope = 'activity' and activity_id is not null and team_id is null) or (scope = 'team' and team_id is not null))));`);
    this.addSql(`create index "invitations_club_id_index" on "invitations" ("club_id");`);
    this.addSql(`alter table "invitations" add constraint "invitations_token_hash_unique" unique ("token_hash");`);
    this.addSql(`create index "invitations_club_id_email_index" on "invitations" ("club_id", "email");`);

    this.addSql(`create table "documents" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "person_id" uuid not null, "category" text check ("category" in ('medical_certificate')) not null, "mime" varchar(30) not null, "size" int not null, "storage_key" text not null, "uploaded_by_id" uuid null, constraint "documents_pkey" primary key ("id"));`);
    this.addSql(`create index "documents_club_id_index" on "documents" ("club_id");`);
    this.addSql(`create index "documents_person_id_category_index" on "documents" ("person_id", "category");`);

    this.addSql(`create table "medical_certificates" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "person_id" uuid not null, "type" text check ("type" in ('competitive', 'not_competitive')) not null, "issue_date" date not null, "expiry_date" date not null, "document_id" uuid null, constraint "medical_certificates_pkey" primary key ("id"), constraint medical_certificates_check check (expiry_date >= issue_date));`);
    this.addSql(`create index "medical_certificates_club_id_index" on "medical_certificates" ("club_id");`);
    this.addSql(`create index "medical_certificates_expiry_date_index" on "medical_certificates" ("expiry_date");`);
    this.addSql(`alter table "medical_certificates" add constraint "medical_certificates_document_id_unique" unique ("document_id");`);
    this.addSql(`create index "medical_certificates_person_id_expiry_date_index" on "medical_certificates" ("person_id", "expiry_date");`);

    this.addSql(`create table "audit_log" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid null, "user_id" uuid null, "action" text check ("action" in ('registration', 'login_ok', 'login_ko', 'club_created', 'invitation_created', 'invitation_accepted', 'invitation_revoked', 'invitation_resent', 'policy_modified', 'role_assigned', 'role_removed', 'club_detachment', 'certificate_read', 'file_certificate_read', 'certificate_modified', 'enrollment_status_modified', 'person_disabled', 'person_reenabled', 'closed_enrollment', 'closed_season', 'person_exported', 'person_deleted', 'terms_accepted')) not null, "entity" varchar(60) null, "entity_id" uuid null, "meta" jsonb null, constraint "audit_log_pkey" primary key ("id"));`);
    this.addSql(`create index "audit_log_entity_entity_id_index" on "audit_log" ("entity", "entity_id");`);
    this.addSql(`create index "audit_log_club_id_created_at_index" on "audit_log" ("club_id", "created_at");`);

    this.addSql(`create table "access_roles" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "user_id" uuid not null, "role" text check ("role" in ('admin', 'manager')) not null, "scope" text check ("scope" in ('club', 'activity', 'team')) not null, "activity_id" uuid null, "team_id" uuid null, constraint "access_roles_pkey" primary key ("id"), constraint access_admin_roles_only_club check ((role <> 'admin' or scope = 'club')), constraint access_scope_consistent_roles check (((scope = 'club' and activity_id is null and team_id is null) or (scope = 'activity' and activity_id is not null and team_id is null) or (scope = 'team' and team_id is not null))));`);
    this.addSql(`create index "access_roles_club_id_index" on "access_roles" ("club_id");`);
    this.addSql(`create index "access_roles_user_id_index" on "access_roles" ("user_id");`);

    this.addSql(`create table "venues" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "name" varchar(150) not null, "address" varchar(300) null, constraint "venues_pkey" primary key ("id"));`);
    this.addSql(`create index "venues_club_id_index" on "venues" ("club_id");`);

    this.addSql(`create table "event_series" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "season_id" uuid not null, "type" text check ("type" in ('training', 'match', 'other')) not null, "title" varchar(150) null, "rule" varchar(300) not null, "start_date" date not null, "until_to" date null, "time_start" varchar(5) not null, "duration_minutes" int not null, "timezone" varchar(60) not null default 'Europe/Rome', "venue_id" uuid null, constraint "event_series_pkey" primary key ("id"));`);
    this.addSql(`create index "event_series_club_id_index" on "event_series" ("club_id");`);
    this.addSql(`create index "event_series_season_id_index" on "event_series" ("season_id");`);

    this.addSql(`create table "events" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "season_id" uuid not null, "series_id" uuid null, "exception" boolean not null default false, "type" text check ("type" in ('training', 'match', 'other')) not null, "title" varchar(150) null, "start" timestamptz not null, "end" timestamptz not null, "venue_id" uuid null, "note" text null, "status" text check ("status" in ('scheduled', 'cancelled', 'concluded')) not null default 'scheduled', "opponent_id" uuid null, "home_away" text check ("home_away" in ('home', 'away', 'neutral')) null, "competition" varchar(150) null, "own_score" int null, "opponent_score" int null, constraint "events_pkey" primary key ("id"), constraint events_fields_only_match check ((type = 'match' or (opponent_id is null and home_away is null and own_score is null and opponent_score is null))), constraint events_end_after_start check ("end" > "start"));`);
    this.addSql(`create index "events_club_id_index" on "events" ("club_id");`);
    this.addSql(`create index "events_series_id_index" on "events" ("series_id");`);
    this.addSql(`create index "events_club_id_start_index" on "events" ("club_id", "start");`);
    this.addSql(`create index "events_season_id_start_index" on "events" ("season_id", "start");`);

    this.addSql(`create table "callups" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "event_id" uuid not null, "enrollment_id" uuid not null, "response" text check ("response" in ('pending', 'confirmed', 'declined')) not null default 'pending', "reason" text check ("reason" in ('commitment_personal', 'work', 'not_available')) null, "response_at" timestamptz null, "notified_at" timestamptz null, "placement" text check ("placement" in ('starter', 'bench')) null, constraint "callups_pkey" primary key ("id"), constraint callups_check check ((reason is null or response = 'declined')));`);
    this.addSql(`create index "callups_club_id_index" on "callups" ("club_id");`);
    this.addSql(`create index "callups_enrollment_id_index" on "callups" ("enrollment_id");`);
    this.addSql(`alter table "callups" add constraint "callups_event_id_enrollment_id_unique" unique ("event_id", "enrollment_id");`);

    this.addSql(`create table "attendances" ("id" uuid not null default gen_random_uuid(), "created_at" timestamptz not null, "updated_at" timestamptz not null, "club_id" uuid not null, "event_id" uuid not null, "enrollment_id" uuid not null, "outcome" text check ("outcome" in ('present', 'absent_excused', 'absent', 'late')) not null, "registered_by_id" uuid null, "registered_at" timestamptz not null, constraint "attendances_pkey" primary key ("id"));`);
    this.addSql(`create index "attendances_club_id_index" on "attendances" ("club_id");`);
    this.addSql(`create index "attendances_enrollment_id_index" on "attendances" ("enrollment_id");`);
    this.addSql(`alter table "attendances" add constraint "attendances_event_id_enrollment_id_unique" unique ("event_id", "enrollment_id");`);

    this.addSql(`alter table "activities" add constraint "activities_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "activities" add constraint "activities_sport_profile_id_foreign" foreign key ("sport_profile_id") references "sport_profiles" ("id") on update cascade;`);

    this.addSql(`alter table "opponents" add constraint "opponents_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "opponents" add constraint "opponents_activity_id_foreign" foreign key ("activity_id") references "activities" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "teams" add constraint "teams_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "teams" add constraint "teams_activity_id_foreign" foreign key ("activity_id") references "activities" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "seasons" add constraint "seasons_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "seasons" add constraint "seasons_team_id_foreign" foreign key ("team_id") references "teams" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "terms_acceptances" add constraint "terms_acceptances_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "terms_acceptances" add constraint "terms_acceptances_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "push_subscriptions" add constraint "push_subscriptions_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "people" add constraint "people_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "people" add constraint "people_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "guardian_links" add constraint "guardian_links_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "guardian_links" add constraint "guardian_links_minor_id_foreign" foreign key ("minor_id") references "people" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "guardian_links" add constraint "guardian_links_guardian_id_foreign" foreign key ("guardian_id") references "people" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "enrollments" add constraint "enrollments_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "enrollments" add constraint "enrollments_season_id_foreign" foreign key ("season_id") references "seasons" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "enrollments" add constraint "enrollments_person_id_foreign" foreign key ("person_id") references "people" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "consents" add constraint "consents_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "consents" add constraint "consents_person_id_foreign" foreign key ("person_id") references "people" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "consents" add constraint "consents_granted_by_id_foreign" foreign key ("granted_by_id") references "people" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "notification_preferences" add constraint "notification_preferences_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "notification_preferences" add constraint "notification_preferences_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "notifications" add constraint "notifications_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "notifications" add constraint "notifications_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "memberships" add constraint "memberships_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "memberships" add constraint "memberships_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "invitations" add constraint "invitations_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "invitations" add constraint "invitations_activity_id_foreign" foreign key ("activity_id") references "activities" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "invitations" add constraint "invitations_team_id_foreign" foreign key ("team_id") references "teams" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "invitations" add constraint "invitations_person_id_foreign" foreign key ("person_id") references "people" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "invitations" add constraint "invitations_invited_by_id_foreign" foreign key ("invited_by_id") references "users" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "invitations" add constraint "invitations_accepted_by_id_foreign" foreign key ("accepted_by_id") references "users" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "documents" add constraint "documents_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "documents" add constraint "documents_person_id_foreign" foreign key ("person_id") references "people" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "documents" add constraint "documents_uploaded_by_id_foreign" foreign key ("uploaded_by_id") references "users" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "medical_certificates" add constraint "medical_certificates_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "medical_certificates" add constraint "medical_certificates_person_id_foreign" foreign key ("person_id") references "people" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "medical_certificates" add constraint "medical_certificates_document_id_foreign" foreign key ("document_id") references "documents" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "audit_log" add constraint "audit_log_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "audit_log" add constraint "audit_log_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "access_roles" add constraint "access_roles_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "access_roles" add constraint "access_roles_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "access_roles" add constraint "access_roles_activity_id_foreign" foreign key ("activity_id") references "activities" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "access_roles" add constraint "access_roles_team_id_foreign" foreign key ("team_id") references "teams" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "venues" add constraint "venues_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "event_series" add constraint "event_series_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "event_series" add constraint "event_series_season_id_foreign" foreign key ("season_id") references "seasons" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "event_series" add constraint "event_series_venue_id_foreign" foreign key ("venue_id") references "venues" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "events" add constraint "events_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "events" add constraint "events_season_id_foreign" foreign key ("season_id") references "seasons" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "events" add constraint "events_series_id_foreign" foreign key ("series_id") references "event_series" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "events" add constraint "events_venue_id_foreign" foreign key ("venue_id") references "venues" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "events" add constraint "events_opponent_id_foreign" foreign key ("opponent_id") references "opponents" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "callups" add constraint "callups_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "callups" add constraint "callups_event_id_foreign" foreign key ("event_id") references "events" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "callups" add constraint "callups_enrollment_id_foreign" foreign key ("enrollment_id") references "enrollments" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "attendances" add constraint "attendances_club_id_foreign" foreign key ("club_id") references "clubs" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "attendances" add constraint "attendances_event_id_foreign" foreign key ("event_id") references "events" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "attendances" add constraint "attendances_enrollment_id_foreign" foreign key ("enrollment_id") references "enrollments" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "attendances" add constraint "attendances_registered_by_id_foreign" foreign key ("registered_by_id") references "users" ("id") on update cascade on delete set null;`);
  }

}
