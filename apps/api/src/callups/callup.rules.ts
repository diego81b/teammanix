import type { CtxRole } from '../common/auth-context';
import { CallupResponse, EnrollmentStatus, StaffRole, type EventType, type ReasonDecline } from '../entities/enums';
import type { CertificateStatus } from '../certificates/certificate.rules';
import { canReadSeasonEvents, type SeasonTarget } from '../events/visibility';

/**
 * Pure rules of the call-up (ANALISI rules 2, 3 and 6). No DB, no Nest.
 *
 * Why a person cannot or should not be called up is a list of reasons. Each reason has a severity:
 * - hard: refuses the call-up, nobody can force it (injured, suspended, certificate when the club blocks);
 * - confirm: refuses unless the coach confirms (declared absence);
 * - warning: lets it through and shows a notice (certificate expiring, or expired when the club only warns, overlapping event).
 */
export type Severity = 'hard' | 'confirm' | 'warning';

export interface Reason {
  /** Stable code, translated by the frontend as `callup.reason.<code>`. */
  code: string;
  severity: Severity;
  /** ISO day until which the block lasts, when known (declared absence). */
  until?: string;
}

/** What the reasons are computed from. Providers read what they need; new blocks add fields here. */
export interface Candidate {
  status: EnrollmentStatus;
  certificate: CertificateStatus;
}

export interface EventContext {
  eventType: EventType;
  /** Club setting: an expired or missing certificate blocks the call-up (true) or only warns (false). */
  blockCertificate: boolean;
}

/**
 * A source of reasons. Absences (rule 10) and suspensions (rule 13) arrive in later slices as new providers,
 * without touching `evaluate`, `canCallUp` or `partition`.
 */
export type ReasonProvider = (candidate: Candidate, ctx: EventContext) => Reason[];

export const statusProvider: ReasonProvider = (c) => (c.status === EnrollmentStatus.INJURED ? [{ code: 'injured', severity: 'hard' }] : []);

export const certificateProvider: ReasonProvider = (c, ctx) => {
  switch (c.certificate) {
    case 'expired':
    case 'missing':
      return [{ code: `certificate_${c.certificate}`, severity: ctx.blockCertificate ? 'hard' : 'warning' }];
    case 'expiring':
      return [{ code: 'certificate_expiring', severity: 'warning' }];
    case 'valid':
      return [];
  }
};

export const DEFAULT_PROVIDERS: readonly ReasonProvider[] = [statusProvider, certificateProvider];

export function evaluate(candidate: Candidate, ctx: EventContext, providers: readonly ReasonProvider[] = DEFAULT_PROVIDERS): Reason[] {
  return providers.flatMap((p) => p(candidate, ctx));
}

export type CallUpVerdict = 'ok' | 'NOT_CALLABLE' | 'CONFIRMATION_REQUIRED';

/** Hard reasons refuse for good, `confirm` ones need the coach's confirmation, warnings never stop. */
export function canCallUp(reasons: readonly Reason[], confirmed: boolean): CallUpVerdict {
  if (reasons.some((r) => r.severity === 'hard')) return 'NOT_CALLABLE';
  if (!confirmed && reasons.some((r) => r.severity === 'confirm')) return 'CONFIRMATION_REQUIRED';
  return 'ok';
}

export interface ListRow {
  enrollmentId: string;
  calledUp: boolean;
  reasons: readonly Reason[];
}

/** Called up first; the others are not callable if a reason refuses or asks for confirmation, otherwise callable. */
export function partition<T extends ListRow>(rows: readonly T[]): { calledUp: T[]; callable: T[]; notCallable: T[] } {
  const lists: { calledUp: T[]; callable: T[]; notCallable: T[] } = { calledUp: [], callable: [], notCallable: [] };
  for (const r of rows) {
    if (r.calledUp) lists.calledUp.push(r);
    else if (r.reasons.some((x) => x.severity !== 'warning')) lists.notCallable.push(r);
    else lists.callable.push(r);
  }
  return lists;
}

/**
 * What the person sees of the call-up (ANALISI section 6):
 * - manage: has `callups.manage` in the team;
 * - read: all three lists in read only (admin, managers in scope, staff of the season);
 * - player: only who is called up, never callable or not callable (that would reveal injuries and certificates of teammates);
 * - none: nothing.
 */
export type CallupView = 'manage' | 'read' | 'player' | 'none';

export interface ViewInput {
  roles: readonly CtxRole[];
  /** Open or closed enrollments of the person in the season of the event. */
  enrollments: readonly { type: 'player' | 'staff' }[];
  canManage: boolean;
  season: SeasonTarget;
}

export function viewOf(i: ViewInput): CallupView {
  if (i.canManage) return 'manage';
  if (canReadSeasonEvents(i.roles, [], i.season) || i.enrollments.some((e) => e.type === 'staff')) return 'read';
  return i.enrollments.some((e) => e.type === 'player') ? 'player' : 'none';
}

/** An answer to an event: a player to a call-up, a staff member for their availability. */
export interface Answer {
  response: CallupResponse;
  reason?: ReasonDecline | null;
}

/**
 * Checks the shape of an answer. `pending` is the lack of an answer, never given. A player who declines names a reason from
 * the closed list; a confirmation has none. Staff give no reason at all: "not available" is the whole answer.
 */
export function checkAnswer(kind: 'player' | 'staff', a: Answer): 'ok' | 'REASON_REQUIRED' | 'INVALID_DATA' {
  if (a.response === CallupResponse.PENDING) return 'INVALID_DATA';
  const reason = a.reason ?? null;
  if (kind === 'staff' || a.response === CallupResponse.CONFIRMED) return reason === null ? 'ok' : 'INVALID_DATA';
  return reason === null ? 'REASON_REQUIRED' : 'ok';
}

/** A new answer is worth a line of history when the answer or its reason differs from the current one. */
export function isChange(was: { response: CallupResponse; reason: ReasonDecline | null }, next: Answer): boolean {
  return was.response !== next.response || was.reason !== (next.reason ?? null);
}

/** Warning for staff: nobody in a role the club counts as coach has declared available. */
export function noCoachAvailable(
  staff: readonly { staffRole: string | null; response: CallupResponse | null }[],
  coachRoles: readonly string[],
): boolean {
  return !staff.some((s) => s.staffRole !== null && coachRoles.includes(s.staffRole) && s.response === CallupResponse.CONFIRMED);
}
