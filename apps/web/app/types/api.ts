// Types shared with the API (apps/api). Keep them aligned by hand until there is a shared package.

export type Language = 'it' | 'en' | 'fr'

export type ScopeType = 'club' | 'activity' | 'team'
export type AccessRole = 'admin' | 'manager'

export interface CtxRole {
  role: AccessRole
  scope: ScopeType
  activityId: string | null
  teamId: string | null
}

export interface Membership {
  clubId: string
  name: string
  roles: CtxRole[]
  /** true if the account is linked to a record (player or staff) in this club. */
  linkedToPerson: boolean
  /** true if the record exists but the person has not completed it yet. */
  recordToComplete: boolean
}

export interface UserDto {
  id: string
  email: string
  name: string
  surname: string
  language: Language
}

/** Response of login, club selection, club creation, invitation acceptance, password change. */
export interface SessionDto {
  accessToken: string
  user: UserDto
  activeClub: { id: string; name: string } | null
  memberships: Membership[]
}

/** Response of GET auth/me (without new token). */
export interface MeDto {
  user: UserDto
  activeClub: Membership | null
  memberships: Membership[]
}

export type InvitationRole = 'admin' | 'manager' | 'staff' | 'player'

/** Response of GET inviti/anteprima: what is behind the link, without email. */
export interface PreviewInvitation {
  club: string
  role: InvitationRole
  scope: ScopeType
  /** Language chosen by the inviter. */
  language: Language
  destination: string | null
  recordName: string | null
}

export interface MessageDto {
  message: string
}

export interface RecordDto {
  id: string
  name: string
  surname: string | null
  birthDate: string | null
  email: string | null
  phone: string | null
  toComplete: boolean
}

// --- Slice 2: structure, people, certificates, invitations, roles, permissions ---

export type SeasonStatus = 'draft' | 'active' | 'closed'
export type EnrollmentType = 'player' | 'staff'
export type StaffRole = 'coach' | 'assistant_coach' | 'trainer' | 'escort' | 'other'
export type EnrollmentStatus = 'available' | 'injured'
export type CertificateStatus = 'missing' | 'valid' | 'expiring' | 'expired'
export type CertificateType = 'competitive' | 'not_competitive'
export type TeamGender = 'male' | 'female' | 'mixed'
export type InvitationStatus = 'sent' | 'accepted' | 'revoked' | 'expired'

/** Codes only: sport name and positions are translated with `sport.<codice>` and `posizione.<codice>`. */
export interface SportProfileDto {
  code: string
  positions: string[]
  starterBench: boolean
  maxStarters: number | null
  modulesAvailable: string[]
}

export interface SeasonDto {
  id: string
  teamId: string
  name: string
  startDate: string
  endDate: string
  status: SeasonStatus
  league: string | null
}

export interface TeamDto {
  id: string
  activityId: string
  name: string
  category: string | null
  gender: TeamGender | null
}

export interface ActivityDto {
  id: string
  name: string
  sportProfile: string
  modulesActive: string[]
}

export type TeamTree = TeamDto & { seasons: SeasonDto[] }
export type ActivityTree = ActivityDto & { teams: TeamTree[] }

export interface SummaryCertificate {
  status: CertificateStatus
  expiry: string | null
}

export interface RosterRow {
  id: string
  personId: string
  name: string
  surname: string | null
  type: EnrollmentType
  staffRole: StaffRole | null
  position: string | null
  jerseyNumber: number | null
  status: EnrollmentStatus
  certificate: SummaryCertificate | null
}

export interface EnrollmentOut {
  id: string
  personId: string
  type: EnrollmentType
  staffRole: StaffRole | null
  position: string | null
  jerseyNumber: number | null
  status: EnrollmentStatus
  seasonId: string
  endedAt: string | null
}

export interface PersonDto {
  id: string
  name: string
  surname: string | null
  birthDate: string | null
  email: string | null
  phone: string | null
  toComplete: boolean
  disabled: boolean
}

export interface EnrollmentPersonDto {
  id: string
  seasonId: string
  season: string
  teamId: string
  team: string
  activity: string
  type: EnrollmentType
  staffRole: StaffRole | null
  position: string | null
  jerseyNumber: number | null
  status: EnrollmentStatus
  endedAt: string | null
}

export interface PersonDetail extends PersonDto {
  certificate: SummaryCertificate | null
  enrollments: EnrollmentPersonDto[]
}

export interface CertificateDto {
  id: string
  personId: string
  type: CertificateType
  issueDate: string
  expiryDate: string
  status: CertificateStatus
  hasFile: boolean
  fileType: string | null
}

export interface PersonCertificates extends SummaryCertificate {
  certificates: CertificateDto[]
}

export interface ClubSettings {
  certificatesWithFile: boolean
}

export interface InvitationDto {
  id: string
  email: string
  role: InvitationRole
  scope: ScopeType
  activityId: string | null
  teamId: string | null
  personId: string | null
  status: InvitationStatus
  language: Language
  expiresAt: string
}

export interface RoleDto {
  id: string
  userId: string
  name: string
  surname: string
  email: string
  role: AccessRole
  scope: ScopeType
  activityId: string | null
  teamId: string | null
  destination: string | null
}

export type PolicyKey =
  | 'events.manage'
  | 'callups.manage'
  | 'attendances.record'
  | 'suspensions.manage'
  | 'people.manage'
  | 'people.disable'
  | 'certificates.status'
  | 'certificates.file'

export type RolePolicy = AccessRole | StaffRole | 'player'
export type DiffPolicy = Partial<Record<PolicyKey, boolean>>

export interface PermissionDtoRole {
  role: RolePolicy
  scope: ScopeType
  destination: string | null
  season: string | null
}

export interface PermissionDto {
  userId: string
  name: string
  surname: string
  email: string
  roles: PermissionDtoRole[]
  diff: DiffPolicy
  defaultValue: PolicyKey[]
  effective: PolicyKey[]
  editable: boolean
}

// --- Slice 3: events ---

export type EventType = 'training' | 'match' | 'other'
export type EventStatus = 'scheduled' | 'cancelled' | 'postponed' | 'concluded'
export type HomeAway = 'home' | 'away' | 'neutral'

export interface VenueDto {
  id: string
  name: string
  address: string | null
}

export interface OpponentDto {
  id: string
  name: string
}

export interface EventDto {
  id: string
  seasonId: string
  teamId: string
  type: EventType
  title: string | null
  start: string
  end: string
  venue: { id: string, name: string } | null
  note: string | null
  status: EventStatus
  opponent: { id: string, name: string } | null
  homeAway: HomeAway | null
  competition: string | null
  /** The series that made it, or null for an event planned one by one. */
  seriesId: string | null
  /** Edited by hand: "all future ones" does not touch it. */
  exception: boolean
}

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

/** Recurring trainings: a weekly rule that makes real events. Days are club-local, the time is the club's wall clock. */
export interface SeriesDto {
  id: string
  seasonId: string
  teamId: string
  type: EventType
  title: string | null
  venue: { id: string, name: string } | null
  weekdays: Weekday[]
  intervalWeeks: number
  startDate: string
  endDate: string
  timeStart: string
  durationMinutes: number
  eventCount: number
}

/** An event in the personal calendar or the home: the event plus where it belongs. */
export interface CalendarEntryDto extends EventDto {
  teamName: string
  seasonName: string
  seasonStatus: SeasonStatus
}

/** A team season whose calendar the person can open. */
export interface CalendarSeasonDto {
  seasonId: string
  seasonName: string
  seasonStatus: SeasonStatus
  teamId: string
  teamName: string
  activityName: string
}

export type CallupSeverity = 'hard' | 'confirm' | 'warning'

/** Why a player cannot be called up or should be looked at. The code is translated as `callup.reason.<code>`. */
export interface CallupReason {
  code: string
  severity: CallupSeverity
  /** ISO day until which the block lasts, when known. */
  until?: string | null
}

export type CallupResponse = 'pending' | 'confirmed' | 'declined'
export type Placement = 'starter' | 'bench'

/** Row of the lists seen by staff, managers and admin. */
export interface CallupRow {
  enrollmentId: string
  personId: string
  name: string
  surname: string | null
  jerseyNumber: number | null
  position: string | null
  status: EnrollmentStatus
  /** Only for called-up people. */
  response: CallupResponse | null
  placement: Placement | null
  /** The call-up was already sent. */
  notified: boolean
  reasons: CallupReason[]
}

export interface StaffCallups {
  event: EventDto
  view: 'manage' | 'read'
  starterBench: boolean
  blockCertificate: boolean
  calledUp: CallupRow[]
  callable: CallupRow[]
  notCallable: CallupRow[]
  /** Every staff member of the season with their answer. */
  staff: StaffAnswerRow[]
  /** The club asks for it and no coach declared available. */
  noCoachWarning: boolean
}

export type ReasonDecline = 'commitment_personal' | 'work' | 'not_available'

/** A staff member of the season and their answer for the event: null = no answer yet. */
export interface StaffAnswerRow {
  enrollmentId: string
  name: string
  surname: string | null
  staffRole: StaffRole | null
  response: CallupResponse | null
  mine: boolean
  /** Only on the viewer's own row: the declared absence that covers the event (`until` null: no end). */
  absence?: { until: string | null } | null
}

export interface AvailableStaff {
  enrollmentId: string
  name: string
  surname: string | null
  staffRole: StaffRole | null
}

export interface AnswerResult {
  enrollmentId: string
  response: CallupResponse
  reason: ReasonDecline | null
  responseAt: string | null
}

/** One change of answer, with its date. For staff, managers and the admin. */
export interface AnswerChange {
  from: CallupResponse
  fromReason: ReasonDecline | null
  to: CallupResponse
  reason: ReasonDecline | null
  changedAt: string
}

/** What the player gets: who is called up and the answers, nothing else. */
export interface PlayerCallups {
  event: EventDto
  view: 'player'
  iAmCalledUp: boolean
  calledUp: { enrollmentId: string, name: string, surname: string | null, jerseyNumber: number | null, response: CallupResponse, mine: boolean }[]
  /** Only the staff who declared available. */
  staff: AvailableStaff[]
}

export type CallupsDto = StaffCallups | PlayerCallups

export interface AbsenceOut {
  id: string
  startDate: string
  endDate: string | null
}

/** An answer already given to an event that a new absence covers. */
export interface AffectedEvent {
  eventId: string
  type: EventType
  title: string | null
  start: string
  response: CallupResponse
}

export interface AbsenceResult {
  absence: AbsenceOut
  affected: AffectedEvent[]
}

/** An open enrollment of the logged in person with their absences as entered. */
export interface MyEnrollmentAbsences {
  enrollmentId: string
  type: EnrollmentType
  teamName: string
  seasonName: string
  seasonStatus: SeasonStatus
  seasonStart: string
  seasonEnd: string
  absences: AbsenceOut[]
}
