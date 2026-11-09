import type { AnswerChange, CallupReason, CallupResponse, CallupRow, Placement, ReasonDecline, StaffAnswerRow } from '../types/api'

export type CallupList = 'calledUp' | 'callable' | 'notCallable'

/** Reasons that refuse the call-up (hard) or ask for a confirmation (confirm). */
export const blockers = (r: Pick<CallupRow, 'reasons'>): CallupReason[] => r.reasons.filter(x => x.severity !== 'warning')

/** Reasons that only show a notice. */
export const warnings = (r: Pick<CallupRow, 'reasons'>): CallupReason[] => r.reasons.filter(x => x.severity === 'warning')

export const reasonKey = (code: string): string => `callup.reason.${code}`

export type RowAction = 'add' | 'add_confirm' | 'remove' | 'none'

/**
 * What a tap on the row does. A hard reason refuses for good (the API refuses too), a confirm reason adds after a
 * confirmation, warnings never stop. The API stays the authority: it checks again.
 */
export function rowAction(list: CallupList, row: Pick<CallupRow, 'reasons'>): RowAction {
  if (list === 'calledUp') return 'remove'
  if (row.reasons.some(r => r.severity === 'hard')) return 'none'
  return row.reasons.some(r => r.severity === 'confirm') ? 'add_confirm' : 'add'
}

/** A tap on the mark already set clears it, a tap on the other one replaces it. */
export const togglePlacement = (current: Placement | null, tapped: Placement): Placement | null => (current === tapped ? null : tapped)

export function callupCounts(lists: { calledUp: unknown[], callable: unknown[], notCallable: unknown[] }) {
  return { calledUp: lists.calledUp.length, callable: lists.callable.length, notCallable: lists.notCallable.length }
}

/** Call-ups not sent yet: the next send reaches only them. */
export const unsentCount = (calledUp: readonly Pick<CallupRow, 'notified'>[]): number => calledUp.filter(r => !r.notified).length

export const needsConfirmation = (code: string | undefined): boolean => code === 'CALLUP_CONFIRMATION_REQUIRED'

/** The closed list of reasons for a player who declines (same codes as the API). */
export const DECLINE_REASONS: ReasonDecline[] = ['commitment_personal', 'work', 'not_available']

/** The answer of the logged-in player to the call-up, or null when they are not called up. */
export const myAnswer = (calledUp: readonly { response: CallupResponse, mine: boolean }[]): CallupResponse | null =>
  calledUp.find(r => r.mine)?.response ?? null

/** Declining asks for a reason, confirming does not. The API checks again. */
export const canSend = (response: Exclude<CallupResponse, 'pending'>, reason: ReasonDecline | null): boolean =>
  response === 'confirmed' || reason !== null

/** Staff of the event by answer. No answer includes the rows the API marks as pending. */
export function groupStaff<T extends Pick<StaffAnswerRow, 'response'>>(staff: readonly T[]): { available: T[], notAvailable: T[], noAnswer: T[] } {
  return {
    available: staff.filter(s => s.response === 'confirmed'),
    notAvailable: staff.filter(s => s.response === 'declined'),
    noAnswer: staff.filter(s => s.response === null || s.response === 'pending'),
  }
}

/** The viewer's own staff row, if the viewer is staff of the season. */
export const ownStaffRow = <T extends Pick<StaffAnswerRow, 'mine'>>(staff: readonly T[]): T | null => staff.find(s => s.mine) ?? null

/** What an entry of the trail says: the new answer and, for a decline, the reason. */
export function historyParts(c: Pick<AnswerChange, 'to' | 'reason'>): { responseKey: string, reasonKey: string | null } {
  return { responseKey: `callup.response.${c.to}`, reasonKey: c.reason ? `callup.declineReason.${c.reason}` : null }
}

/** Date and time of a change, in the reader's language. The zone is the browser's unless given (tests). */
export function formatChangeTime(iso: string, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(iso)).replace(',', '')
}
