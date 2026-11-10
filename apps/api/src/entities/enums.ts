// Domain enums. Values are stable strings stored in the DB: do not rename them after the first release.

export enum ScopeType {
  CLUB = 'club',
  ACTIVITY = 'activity',
  TEAM = 'team',
}

/** UI and email languages. The first is the source language and the fallback. */
export enum Language {
  IT = 'it',
  EN = 'en',
  FR = 'fr',
}

/** Roles with which a person can be invited. Staff and player then derive from the Enrollment. */
export enum InvitationRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  STAFF = 'staff',
  PLAYER = 'player',
}

/** Roles stored in AccessRole. Staff and player do not appear: they derive from the Enrollment. */
export enum AccessRoleType {
  ADMIN = 'admin',
  MANAGER = 'manager',
}

export enum InvitationStatus {
  SENT = 'sent',
  ACCEPTED = 'accepted',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

export enum TeamGender {
  MALE = 'male',
  FEMALE = 'female',
  MIXED = 'mixed',
}

export enum GuardianRelation {
  PARENT = 'parent',
  GUARDIAN_LEGAL = 'legal_guardian',
  OTHER = 'other',
}

export enum CertificateType {
  COMPETITIVE = 'competitive',
  NOT_COMPETITIVE = 'not_competitive',
}

/** File categories of a person. For now only the medical certificate: others arrive with their own access rules. */
export enum DocumentCategory {
  CERTIFICATE_MEDICAL = 'medical_certificate',
}

export enum ConsentType {
  GUARDIAN_OF_MINOR = 'guardian_of_minor',
  IMAGES = 'images',
}

export enum ConsentStatus {
  GRANTED = 'granted',
  REVOKED = 'revoked',
}

export enum TypeLegalDocument {
  TERMS = 'terms',
  PRIVACY = 'privacy',
  DPA = 'dpa',
}

export enum SeasonStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  CLOSED = 'closed',
}

export enum EnrollmentType {
  PLAYER = 'player',
  STAFF = 'staff',
}

export enum StaffRole {
  COACH = 'coach',
  ASSISTANT_COACH = 'assistant_coach',
  TRAINER = 'trainer',
  ESCORT = 'escort',
  OTHER = 'other',
}

/** Manual status, with no clinical detail. Eligibility ("eligible") is computed, not stored. */
export enum EnrollmentStatus {
  AVAILABLE = 'available',
  INJURED = 'injured',
}

export enum EventType {
  TRAINING = 'training',
  MATCH = 'match',
  OTHER = 'other',
}

export enum EventStatus {
  SCHEDULED = 'scheduled',
  CANCELLED = 'cancelled',
  /** Moved to a date not yet set. Kept apart from cancelled: neither counts as served for suspensions (rule 13). */
  POSTPONED = 'postponed',
  CONCLUDED = 'concluded',
}

export enum HomeAway {
  HOME = 'home',
  AWAY = 'away',
  NEUTRAL = 'neutral',
}

export enum CallupResponse {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  DECLINED = 'declined',
}

/** Closed list, no free text (GDPR minimization). */
export enum ReasonDecline {
  COMMITMENT_PERSONAL = 'commitment_personal',
  WORK = 'work',
  NOT_AVAILABLE = 'not_available',
}

/** Active only if the activity's SportProfile has starterBench = true. Staff and managers only. */
export enum Placement {
  STARTER = 'starter',
  BENCH = 'bench',
}

export enum AttendanceOutcome {
  PRESENT = 'present',
  ABSENT_EXCUSED = 'absent_excused',
  ABSENT = 'absent',
  LATE = 'late',
}

/** Two forms of suspension (rule 13): a period covering every match, or a number of matches from a start. */
export enum SuspensionForm {
  PERIOD = 'period',
  MATCHES = 'matches',
}

export enum NotificationType {
  CALLUP = 'callup',
  EVENT_MODIFIED = 'event_modified',
  EVENT_CANCELLED = 'event_cancelled',
  CERTIFICATE_EXPIRING = 'certificate_expiring',
  CERTIFICATE_EXPIRED = 'certificate_expired',
  /** Digest for staff with the certificates permission: how many certificates of their people are due. Counts only. */
  CERTIFICATES_DUE = 'certificates_due',
  ABSENCE_DECLARED = 'absence_declared',
}

export enum AuditAction {
  REGISTRATION = 'registration',
  LOGIN_OK = 'login_ok',
  LOGIN_KO = 'login_ko',
  CLUB_CREATED = 'club_created',
  INVITATION_CREATED = 'invitation_created',
  INVITATION_ACCEPTED = 'invitation_accepted',
  INVITATION_REVOKED = 'invitation_revoked',
  INVITATION_RESENT = 'invitation_resent',
  POLICY_MODIFIED = 'policy_modified',
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_REMOVED = 'role_removed',
  CLUB_DETACHMENT = 'club_detachment',
  CERTIFICATE_READ = 'certificate_read',
  FILE_CERTIFICATE_READ = 'file_certificate_read',
  CERTIFICATE_MODIFIED = 'certificate_modified',
  ENROLLMENT_STATUS_MODIFIED = 'enrollment_status_modified',
  PERSON_DISABLED = 'person_disabled',
  PERSON_REENABLED = 'person_reenabled',
  ENROLLMENT_CLOSED = 'closed_enrollment',
  SEASON_CLOSED = 'closed_season',
  PERSON_EXPORTED = 'person_exported',
  PERSON_DELETED = 'person_deleted',
  TERMS_ACCEPTED = 'terms_accepted',
  ABSENCE_CREATED = 'absence_created',
  ABSENCE_MODIFIED = 'absence_modified',
  ABSENCE_CANCELLED = 'absence_cancelled',
  SUSPENSION_CREATED = 'suspension_created',
  SUSPENSION_MODIFIED = 'suspension_modified',
  SUSPENSION_CANCELLED = 'suspension_cancelled',
}
